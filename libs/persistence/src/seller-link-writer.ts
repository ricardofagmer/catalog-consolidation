import type { DatabaseSync } from "node:sqlite";
import { Injectable } from "@nestjs/common";
import { SellerLinkError } from "@catalog/domain";
import type { SellerLinkRow } from "./catalog-read-model-rows.js";
import {
  asRow,
  beginTransaction,
  bindText,
  readInteger,
  toRowId,
} from "./sqlite-connection.js";

// A link written or changed by hand is human-confirmed. REVIEWED also tells the consolidator to
// trust it: it never re-matches a REVIEWED link, so a re-run cannot report a false conflict.
const MANUAL_MATCH_TYPE = "REVIEWED";

const SELECT_PRODUCT = "SELECT 1 AS Found FROM Product WHERE Id = ?";
const SELECT_SELLER_ID = "SELECT Id FROM Seller WHERE Name = ?";
const INSERT_SELLER = "INSERT INTO Seller (Name) VALUES (?)";
const SELECT_LINK_OF_PRODUCT = "SELECT 1 AS Found FROM SellerProduct WHERE Id = ? AND ProductId = ?";
// Id <> ? lets an edit keep its own values; 0 never matches a row, which is what an add wants.
const SELECT_SKU_OWNER = "SELECT 1 AS Found FROM SellerProduct WHERE SellerId = ? AND SellerProductId = ? AND Id <> ?";
const SELECT_SELLER_PRODUCT_OWNER = "SELECT 1 AS Found FROM SellerProduct WHERE SellerId = ? AND ProductId = ? AND Id <> ?";
const INSERT_LINK = "INSERT INTO SellerProduct (SellerId, ProductId, SellerProductId, MatchType) VALUES (?, ?, ?, ?)";
const UPDATE_LINK = "UPDATE SellerProduct SET SellerId = ?, SellerProductId = ?, MatchType = ? WHERE Id = ? AND ProductId = ?";
const DELETE_LINK = "DELETE FROM SellerProduct WHERE Id = ? AND ProductId = ?";
const NO_LINK_ID = 0;

export interface SellerLinkValues {
  readonly sellerName: string;
  readonly sellerProductId: string;
}

/**
 * Manual changes to the Seller <-> Product link table. Each call runs in one write transaction that
 * takes the lock at BEGIN, so a concurrent writer is waited on and a refusal rolls everything back,
 * including a seller row registered for the attempt.
 */
@Injectable()
export class SellerLinkWriter {
  /** Links every listed seller to the product, or none of them: one refusal rolls the batch back. */
  addMany(args: { connection: DatabaseSync; productId: number; links: readonly SellerLinkValues[] }): SellerLinkRow[] {
    return this.inTransaction(args.connection, () => {
      requireProduct(args.connection, args.productId);
      return args.links.map((link) => {
        const sellerId = registerSeller(args.connection, link.sellerName);
        requireFreeValues({
          connection: args.connection,
          productId: args.productId,
          sellerId,
          sellerProductId: link.sellerProductId,
          ignoreLinkId: NO_LINK_ID,
        });
        const result = args.connection
          .prepare(INSERT_LINK)
          .run(sellerId, args.productId, bindText(link.sellerProductId), MANUAL_MATCH_TYPE);
        return linkRow({ id: toRowId(result.lastInsertRowid), ...link });
      });
    });
  }

  update(args: { connection: DatabaseSync; productId: number; linkId: number } & SellerLinkValues): SellerLinkRow {
    return this.inTransaction(args.connection, () => {
      requireLink(args.connection, args);
      const sellerId = registerSeller(args.connection, args.sellerName);
      requireFreeValues({ ...args, sellerId, ignoreLinkId: args.linkId });
      args.connection
        .prepare(UPDATE_LINK)
        .run(sellerId, bindText(args.sellerProductId), MANUAL_MATCH_TYPE, args.linkId, args.productId);
      return linkRow({ id: args.linkId, ...args });
    });
  }

  remove(args: { connection: DatabaseSync; productId: number; linkId: number }): void {
    this.inTransaction(args.connection, () => {
      const result = args.connection.prepare(DELETE_LINK).run(args.linkId, args.productId);
      if (result.changes === 0) {
        throw linkNotFound(args.linkId);
      }
    });
  }

  private inTransaction<T>(connection: DatabaseSync, work: () => T): T {
    beginTransaction(connection, "immediate");
    try {
      const result = work();
      connection.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (connection.isTransaction) {
        connection.exec("ROLLBACK");
      }
      throw error;
    }
  }
}

function requireProduct(connection: DatabaseSync, productId: number): void {
  if (connection.prepare(SELECT_PRODUCT).get(productId) === undefined) {
    throw new SellerLinkError({ code: "product_not_found", detail: `product ${String(productId)} does not exist` });
  }
}

// A link is addressed through its product, so another product's link id answers not-found.
function requireLink(connection: DatabaseSync, args: { productId: number; linkId: number }): void {
  if (connection.prepare(SELECT_LINK_OF_PRODUCT).get(args.linkId, args.productId) === undefined) {
    throw linkNotFound(args.linkId);
  }
}

function linkNotFound(linkId: number): SellerLinkError {
  return new SellerLinkError({ code: "seller_link_not_found", detail: `seller link ${String(linkId)} does not exist` });
}

// Look up before inserting: an INSERT that conflicts still burns an AUTOINCREMENT id.
function registerSeller(connection: DatabaseSync, sellerName: string): number {
  const name = bindText(sellerName);
  const existing = connection.prepare(SELECT_SELLER_ID).get(name);
  if (existing !== undefined) {
    return readInteger(asRow(existing), "Id");
  }
  return toRowId(connection.prepare(INSERT_SELLER).run(name).lastInsertRowid);
}

function requireFreeValues(args: {
  connection: DatabaseSync;
  productId: number;
  sellerId: number;
  sellerProductId: string;
  ignoreLinkId: number;
}): void {
  const { connection, productId, sellerId, ignoreLinkId } = args;
  if (connection.prepare(SELECT_SKU_OWNER).get(sellerId, bindText(args.sellerProductId), ignoreLinkId) !== undefined) {
    throw new SellerLinkError({
      code: "seller_sku_already_linked",
      detail: `seller ${String(sellerId)} already has that seller product id linked`,
    });
  }
  if (connection.prepare(SELECT_SELLER_PRODUCT_OWNER).get(sellerId, productId, ignoreLinkId) !== undefined) {
    throw new SellerLinkError({
      code: "seller_already_linked_to_product",
      detail: `seller ${String(sellerId)} is already linked to product ${String(productId)}`,
    });
  }
}

function linkRow(args: { id: number } & SellerLinkValues): SellerLinkRow {
  return {
    id: args.id,
    sellerName: args.sellerName,
    sellerProductId: args.sellerProductId,
    matchType: MANUAL_MATCH_TYPE,
  };
}
