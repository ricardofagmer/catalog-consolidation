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

  @ApiProperty({ type: "integer", description: "Seller Offers linked to this product" })
  readonly sellerCount: number;

  constructor(fields: ProductListItemDto) {
    this.id = fields.id;
    this.name = fields.name;
    this.brand = fields.brand;
    this.category = fields.category;
    this.sellerCount = fields.sellerCount;
  }
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductListItemDto], description: "Products in ascending id order" })
  readonly items: readonly ProductListItemDto[];

  @ApiProperty({
    type: "integer",
    nullable: true,
    description: "Pass as `after` to read the next page; null on the last page",
  })
  readonly nextCursor: number | null;

  constructor(fields: ProductPageDto) {
    this.items = fields.items;
    this.nextCursor = fields.nextCursor;
  }
}
