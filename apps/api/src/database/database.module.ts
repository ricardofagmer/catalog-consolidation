import { Global, Module } from "@nestjs/common";
import { DatabaseAccess } from "./database-access.js";

@Global()
@Module({ providers: [DatabaseAccess], exports: [DatabaseAccess] })
// Nest modules are metadata-only classes; the decorator carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DatabaseModule {}
