import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiProblemResponses } from "../errors/index.js";
import { ListReviewsQueryDto } from "./dto/list-reviews-query.dto.js";
import { ReviewPageDto } from "./dto/review-page.dto.js";
import { toReviewPageDto } from "./review-queue-response.mapper.js";
import { ReviewQueueService } from "./review-queue.service.js";

@ApiTags("reviews")
@Controller("v1/reviews")
export class ReviewQueueController {
  constructor(private readonly reviewQueue: ReviewQueueService) {}

  @Get()
  @ApiOperation({ summary: "Review queue items by status with their candidates, keyset paged" })
  @ApiOkResponse({ type: ReviewPageDto })
  @ApiProblemResponses(400, 421, 500, 503)
  list(@Query() query: ListReviewsQueryDto): ReviewPageDto {
    const page = this.reviewQueue.list({ status: query.status, afterId: query.after, limit: query.limit });
    return toReviewPageDto(page);
  }
}
