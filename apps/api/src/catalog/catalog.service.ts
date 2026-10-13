import { HttpStatus, Injectable } from "@nestjs/common";
import {
  CatalogReadModel,
  type ProductDetail,
  type ProductPage,
  type ProductSortField,
  type SellerLinkListPage,
  type SellerLinkPage,
  type SellerRow,
  type SortOrder,
  type SummaryCounts,
} from "@catalog/persistence";
import { DatabaseAccess } from "../database/index.js";
import { ApiProblem } from "../errors/index.js";

export interface ProductSearch {
  readonly afterId: number;
  readonly limit: number;
  readonly query: string | null;
  readonly sort: ProductSortField;
  readonly order: SortOrder;
  readonly offset: number;
}

export interface SellerLinkListing {
  readonly afterId: number;
  readonly limit: number;
}

export interface ProductWithOffers {
  readonly product: ProductDetail;
  readonly offers: SellerLinkPage;
}

/** Catalog reads; each operation runs on its own read-only connection. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseAccess,
    private readonly readModel: CatalogReadModel,
  ) {}

  summary(): SummaryCounts {
    return this.database.read((connection) => this.readModel.summary({ connection }));
  }

  listSellers(): readonly SellerRow[] {
    return this.database.read((connection) => this.readModel.listSellers({ connection }));
  }

  listProducts(search: ProductSearch): ProductPage {
    return this.database.read((connection) => this.readModel.listProducts({ connection, ...search }));
  }

  listSellerLinks(listing: SellerLinkListing): SellerLinkListPage {
    return this.database.read((connection) => this.readModel.listSellerLinkPage({ connection, ...listing }));
  }

  productWithOffers(productId: number): ProductWithOffers {
    // Product and offers come from one connection so they describe the same database state.
    return this.database.read((connection) => {
      const product = this.readModel.getProduct({ connection, productId });
      if (product === null) {
        throw new ApiProblem({ code: "product_not_found", status: HttpStatus.NOT_FOUND, message: "product not found" });
      }
      return { product, offers: this.readModel.listSellerLinks({ connection, productId }) };
    });
  }
}
