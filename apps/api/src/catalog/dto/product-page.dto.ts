import { ApiProperty } from "@nestjs/swagger";

export class ProductListItemDto {
  @ApiProperty({ type: "integer", description: "Product id" })
  readonly id: number;

  @ApiProperty({ description: "Display name, as stored" })
  readonly name: string;

  @ApiProperty({ type: String, nullable: true, description: "Display brand, as stored" })
  readonly brand: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Display category, as stored" })
  readonly category: string | null;

  @ApiProperty({ type: [String], description: "Names of the sellers linked to this product, in name order" })
  readonly sellerNames: readonly string[];

  constructor(fields: ProductListItemDto) {
    this.id = fields.id;
    this.name = fields.name;
    this.brand = fields.brand;
    this.category = fields.category;
    this.sellerNames = fields.sellerNames;
  }
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductListItemDto], description: "Products in the requested sort order" })
  readonly items: readonly ProductListItemDto[];

  @ApiProperty({
    type: "integer",
    nullable: true,
    description:
      "Pass as `after` to read the next page; null on the last page and for every order other than " +
      "sort=id&order=asc",
  })
  readonly nextCursor: number | null;

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Pass as `offset` (with the same sort, order and q) to read the next page; null on the last page",
  })
  readonly nextOffset: number | null;

  constructor(fields: ProductPageDto) {
    this.items = fields.items;
    this.nextCursor = fields.nextCursor;
    this.nextOffset = fields.nextOffset;
  }
}
