import { ApiProperty } from "@nestjs/swagger";

export class SellerDto {
  @ApiProperty({ type: "integer", description: "Seller id", example: 1 })
  readonly id: number;

  @ApiProperty({ description: "Seller name, as registered", example: "MegaStore" })
  readonly name: string;

  constructor(fields: SellerDto) {
    this.id = fields.id;
    this.name = fields.name;
  }
}

export class SellerListDto {
  @ApiProperty({ type: [SellerDto], description: "Every registered seller, ordered by name" })
  readonly items: readonly SellerDto[];

  constructor(fields: SellerListDto) {
    this.items = fields.items;
  }
}
