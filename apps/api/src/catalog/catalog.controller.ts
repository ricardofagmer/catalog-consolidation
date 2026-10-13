import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblemResponses } from "../errors/index.js";
import {
  toProductDetailDto,
  toProductPageDto,
  toSellerLinkListPageDto,
  toSellerListDto,
  toSummaryDto,
} from "./catalog-response.mapper.js";
import { CatalogService } from "./catalog.service.js";
import { ListProductsQueryDto } from "./dto/list-products-query.dto.js";
import { ListSellerLinksQueryDto } from "./dto/list-seller-links-query.dto.js";
import { ProductDetailDto } from "./dto/product-detail.dto.js";
import { ProductPageDto } from "./dto/product-page.dto.js";
import { ProductParamsDto } from "./dto/product-params.dto.js";
import { SellerLinkListPageDto } from "./dto/seller-link-list.dto.js";
import { SellerListDto } from "./dto/seller-list.dto.js";
import { SummaryDto } from "./dto/summary.dto.js";

@ApiTags("catalog")
@Controller("v1")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("summary")
  @ApiOperation({ summary: "Catalog counts: products, Seller Offers and pending reviews" })
  @ApiOkResponse({ type: SummaryDto })
  @ApiProblemResponses(421, 500, 503)
  summary(): SummaryDto {
    return toSummaryDto(this.catalog.summary());
  }

  @Get("products")
  @ApiOperation({
    summary: "Products, optionally filtered by name, sorted by any column",
    description:
      "The default order (sort=id, order=asc) pages by the `after` keyset cursor; every order also pages " +
      "by `offset`. `after` cannot be combined with another order or with an offset.",
  })
  @ApiOkResponse({ type: ProductPageDto })
  @ApiProblemResponses(400, 421, 500, 503)
  listProducts(@Query() query: ListProductsQueryDto): ProductPageDto {
    const page = this.catalog.listProducts({
      afterId: query.after,
      limit: query.limit,
      query: query.q ?? null,
      sort: query.sort,
      order: query.order,
      offset: query.offset,
    });
    return toProductPageDto(page);
  }

  @Get("seller-links")
  @ApiOperation({ summary: "Every seller link in the catalog with its product and seller, keyset paged by link id" })
  @ApiOkResponse({ type: SellerLinkListPageDto })
  @ApiProblemResponses(400, 421, 500, 503)
  listSellerLinks(@Query() query: ListSellerLinksQueryDto): SellerLinkListPageDto {
    return toSellerLinkListPageDto(this.catalog.listSellerLinks({ afterId: query.after, limit: query.limit }));
  }

  @Get("products/:id")
  @ApiOperation({ summary: "One product with up to 100 of its Seller Offers" })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiProblemResponses(400, 404, 421, 500, 503)
  getProduct(@Param() params: ProductParamsDto): ProductDetailDto {
    return toProductDetailDto(this.catalog.productWithOffers(params.id));
  }

  @Get("sellers")
  @ApiOperation({ summary: "Every registered seller, ordered by name" })
  @ApiOkResponse({ type: SellerListDto })
  @ApiProblemResponses(421, 500, 503)
  listSellers(): SellerListDto {
    return toSellerListDto(this.catalog.listSellers());
  }
}
