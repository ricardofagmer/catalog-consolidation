import { Global, Module, type DynamicModule } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "./api-config.js";

@Global()
@Module({})
// Nest modules are metadata-only classes; the static factory carries the whole definition.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ApiConfigModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: ApiConfigModule,
      providers: [{ provide: API_CONFIG, useValue: config }],
      exports: [API_CONFIG],
    };
  }
}
