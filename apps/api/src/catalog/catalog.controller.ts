import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblemResponses } from "../errors/index.js";
import { toProductDetailDto, toProductPageDto, toSummaryDto } from "./catalog-response.mapper.js";
import { CatalogService } from "./catalog.service.js";
import { ListProductsQueryDto } from "./dto/list-products-query.dto.js";
import { ProductDetailDto } from "./dto/product-detail.dto.js";
import { ProductPageDto } from "./dto/product-page.dto.js";
import { ProductParamsDto } from "./dto/product-params.dto.js";
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
  @ApiOperation({ summary: "Products in id order, optionally filtered by name, with keyset paging" })
  @ApiOkResponse({ type: ProductPageDto })
  @ApiProblemResponses(400, 421, 500, 503)
  listProducts(@Query() query: ListProductsQueryDto): ProductPageDto {
    const page = this.catalog.listProducts({ afterId: query.after, limit: query.limit, query: query.q ?? null });
    return toProductPageDto(page);
  }

  @Get("products/:id")
  @ApiOperation({ summary: "One product with up to 100 of its Seller Offers" })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiProblemResponses(400, 404, 421, 500, 503)
  getProduct(@Param() params: ProductParamsDto): ProductDetailDto {
    return toProductDetailDto(this.catalog.productWithOffers(params.id));
  }
}
