import { Injectable } from "@nestjs/common";
import { SellerLinkWriter, type SellerLinkRow } from "@catalog/persistence";
import { DatabaseAccess } from "../database/index.js";

export interface SellerLinkInput {
  readonly sellerName: string;
  readonly sellerProductId: string;
}

/** Manual seller-link changes; each runs on its own write connection, in one transaction. */
@Injectable()
export class SellerLinksService {
  constructor(
    private readonly database: DatabaseAccess,
    private readonly writer: SellerLinkWriter,
  ) {}

  // SQLite errors (SQLITE_BUSY after the busy timeout included) propagate unwrapped.
  addMany(args: { productId: number; links: readonly SellerLinkInput[] }): SellerLinkRow[] {
    return this.database.write((connection) => this.writer.addMany({ connection, ...args }));
  }

  update(args: { productId: number; linkId: number } & SellerLinkInput): SellerLinkRow {
    return this.database.write((connection) => this.writer.update({ connection, ...args }));
  }

  remove(args: { productId: number; linkId: number }): void {
    this.database.write((connection) => {
      this.writer.remove({ connection, ...args });
    });
  }
}
