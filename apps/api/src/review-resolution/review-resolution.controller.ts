import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblemResponses } from "../errors/index.js";
import { ResolutionResponseDto } from "./dto/resolution-response.dto.js";
import { ResolveReviewRequestDto } from "./dto/resolve-review-request.dto.js";
import { ReviewIdParamsDto } from "./dto/review-id-params.dto.js";
import { toResolutionProblem } from "./resolution-error.mapper.js";
import { toResolutionRequest } from "./resolution-request.mapper.js";
import { toResolutionResponse } from "./resolution-response.mapper.js";
import { ReviewResolutionService } from "./review-resolution.service.js";

@ApiTags("reviews")
@Controller("v1/reviews")
export class ReviewResolutionController {
  constructor(private readonly resolution: ReviewResolutionService) {}

  @Post(":id/resolution")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resolve one pending review",
    description:
      "Applies link-candidate, link-other, create or reject in one transaction that takes the database write " +
      "lock up front. A busy database is waited on for the busy timeout, then answered 503 database.",
  })
  @ApiOkResponse({ type: ResolutionResponseDto, description: "Review resolved; ids come from the committed transaction" })
  @ApiProblemResponses(400, 404, 409, 415, 421, 422, 503, 500)
  resolve(@Param() params: ReviewIdParamsDto, @Body() body: ResolveReviewRequestDto): ResolutionResponseDto {
    const request = toResolutionRequest({ reviewId: params.id, body });
    try {
      return toResolutionResponse(this.resolution.resolve(request));
    } catch (error: unknown) {
      throw toResolutionProblem(error) ?? error;
    }
  }
}
