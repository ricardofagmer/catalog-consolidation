import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthCheckService } from "@nestjs/terminus";
import { ApiProblemResponses } from "../errors/index.js";
import { DatabaseReadinessIndicator } from "./database-readiness.indicator.js";
import { HealthStatusDto } from "./health-status.dto.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly readiness: DatabaseReadinessIndicator,
  ) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness: the process is running" })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiProblemResponses(421)
  live(): HealthStatusDto {
    return new HealthStatusDto();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness: the database exists and its schema is migrated" })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiProblemResponses(421, 503)
  async ready(): Promise<HealthStatusDto> {
    // A failed check throws ServiceUnavailableException, which the filter answers as 503 database.
    await this.health.check([() => this.readiness.check()]);
    return new HealthStatusDto();
  }
}
