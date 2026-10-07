import { HttpException } from "@nestjs/common";
import type { ApiErrorCode } from "./api-error-codes.js";

export interface ApiProblemArgs {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly message: string;
}

/** An expected failure the API answers with its own status, code and client-safe message. */
export class ApiProblem extends HttpException {
  readonly code: ApiErrorCode;

  constructor(args: ApiProblemArgs) {
    super({ code: args.code, message: args.message }, args.status);
    this.name = "ApiProblem";
    this.code = args.code;
  }
}
