import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblemResponses } from "../errors/index.js";
import { toSellerOfferDto } from "./catalog-response.mapper.js";
import { SellerOfferDto } from "./dto/product-detail.dto.js";
import { ProductParamsDto } from "./dto/product-params.dto.js";
import { AddSellerLinksRequestDto, SellerLinkParamsDto, SellerLinkRequestDto } from "./dto/seller-link-request.dto.js";
import { toSellerLinkProblem } from "./seller-link-error.mapper.js";
import { SellerLinksService } from "./seller-links.service.js";

const WRITE_NOTE =
  "Runs in one transaction that takes the database write lock up front. A busy database is waited on " +
  "for the busy timeout, then answered 503 database. Like every write, it needs Content-Type: application/json.";

@ApiTags("catalog")
@Controller("v1/products/:id/seller-links")
export class SellerLinksController {
  constructor(private readonly sellerLinks: SellerLinksService) {}

  @Post()
  @ApiOperation({
    summary: "Link one or more sellers to a product by hand",
    description:
      "Every link is stored as REVIEWED and an unknown seller name registers a new seller. All links are " +
      `written or none are. ${WRITE_NOTE}`,
  })
  @ApiCreatedResponse({ type: [SellerOfferDto], description: "The new links, in request order" })
  @ApiProblemResponses(400, 404, 409, 415, 421, 503, 500)
  add(@Param() params: ProductParamsDto, @Body() body: AddSellerLinksRequestDto): SellerOfferDto[] {
    const links = body.links.map(({ sellerName, sellerProductId }) => ({ sellerName, sellerProductId }));
    return this.run(() => this.sellerLinks.addMany({ productId: params.id, links })).map(toSellerOfferDto);
  }

  @Put(":linkId")
  @ApiOperation({
    summary: "Replace the seller and seller product id of one link",
    description: `The edited link is stored as REVIEWED, so the consolidator keeps it as it is. ${WRITE_NOTE}`,
  })
  @ApiOkResponse({ type: SellerOfferDto, description: "The link after the edit" })
  @ApiProblemResponses(400, 404, 409, 415, 421, 503, 500)
  update(@Param() params: SellerLinkParamsDto, @Body() body: SellerLinkRequestDto): SellerOfferDto {
    const { sellerName, sellerProductId } = body;
    return toSellerOfferDto(
      this.run(() =>
        this.sellerLinks.update({ productId: params.id, linkId: params.linkId, sellerName, sellerProductId }),
      ),
    );
  }

  @Delete(":linkId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove one seller link from a product",
    description: `The product and the seller stay. The next consolidation run may link the entry again. ${WRITE_NOTE}`,
  })
  @ApiNoContentResponse({ description: "Link removed" })
  @ApiProblemResponses(400, 404, 415, 421, 503, 500)
  remove(@Param() params: SellerLinkParamsDto): void {
    this.run(() => {
      this.sellerLinks.remove({ productId: params.id, linkId: params.linkId });
    });
  }

  private run<T>(work: () => T): T {
    try {
      return work();
    } catch (error: unknown) {
      throw toSellerLinkProblem(error) ?? error;
    }
  }
}
