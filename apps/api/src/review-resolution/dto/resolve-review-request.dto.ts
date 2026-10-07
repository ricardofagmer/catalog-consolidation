import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, ValidateBy, type ValidationArguments } from "class-validator";

export const RESOLUTION_ACTIONS = ["link-candidate", "link-other", "create", "reject"] as const;
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

const LINK_OTHER_ACTION: ResolutionAction = "link-other";
const ACTION_PROPERTY = "action";

export class ResolveReviewRequestDto {
  @ApiProperty({
    enum: RESOLUTION_ACTIONS,
    enumName: "ResolutionAction",
    description:
      "link-candidate links the seller SKU to the review's candidate product (read from the queue row); " +
      "link-other links it to productId; create makes a new product from the review; reject closes the review.",
  })
  @IsIn(RESOLUTION_ACTIONS)
  readonly action!: ResolutionAction;

  @ApiPropertyOptional({
    type: "integer",
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Target product id: required for link-other and rejected for every other action",
    example: 21,
  })
  @IsProductIdForAction()
  readonly productId?: number;
}

// One rule for both directions: a stray productId on another action must not be silently ignored.
function IsProductIdForAction(): PropertyDecorator {
  return ValidateBy({
    name: "isProductIdForAction",
    validator: {
      validate: (value: unknown, args?: ValidationArguments): boolean => {
        const action: unknown = args === undefined ? undefined : Reflect.get(args.object, ACTION_PROPERTY);
        return action === LINK_OTHER_ACTION ? isPositiveSafeInteger(value) : value === undefined;
      },
      defaultMessage: (): string => "productId is required for link-other and not allowed for other actions",
    },
  });
}

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
