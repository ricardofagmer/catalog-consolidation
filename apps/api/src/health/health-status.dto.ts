import { ApiProperty } from "@nestjs/swagger";

const HEALTHY_STATUS = "ok";

export class HealthStatusDto {
  @ApiProperty({ enum: [HEALTHY_STATUS], example: HEALTHY_STATUS })
  readonly status: typeof HEALTHY_STATUS;

  constructor() {
    this.status = HEALTHY_STATUS;
  }
}
