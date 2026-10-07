import {
  MAX_BRAND_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SELLER_NAME_LENGTH,
  MAX_SELLER_PRODUCT_ID_LENGTH,
  SELLER_PRODUCT_ID_PATTERN,
  UUID_PATTERN,
  type FieldName,
  type FieldViolation,
  type InputEntry,
  type WarningCode,
} from "@catalog/domain";
import type { TextService } from "@catalog/rules";

const KNOWN_FIELDS: ReadonlySet<string> = new Set<FieldName>(["Id", "SellerName", "Name", "Brand", "Category"]);

type JsonObject = Readonly<Record<string, unknown>>;

interface FieldResult {
  readonly value: string | null;
  readonly violation: FieldViolation | null;
}

const ACCEPTED_ABSENT: FieldResult = { value: null, violation: null };

/** Record-level validation of one seller entry; Python text semantics come from TextService. */
export class SellerRecordValidator {
  constructor(private readonly text: TextService) {}

  validateRecord(index: number, record: unknown): InputEntry {
    if (!isJsonObject(record)) {
      return {
        kind: "rejected",
        index,
        sellerName: null,
        sellerProductId: null,
        violations: [{ field: "record", code: "not_an_object" }],
        warnings: [],
      };
    }
    const sellerProductId = this.sellerProductIdField(record);
    const sellerName = this.requiredText(record, "SellerName", MAX_SELLER_NAME_LENGTH);
    const name = this.requiredText(record, "Name", MAX_NAME_LENGTH);
    const brand = this.optionalText(record, "Brand", MAX_BRAND_LENGTH);
    const category = this.optionalText(record, "Category", MAX_CATEGORY_LENGTH);

    const warnings: WarningCode[] = [];
    if (sellerProductId.value !== null && !UUID_PATTERN.test(sellerProductId.value)) {
      warnings.push("non_uuid_seller_sku");
    }
    if (this.isBlankText(fieldValue(record, "Brand")) && brand.violation === null) {
      warnings.push("blank_brand_treated_as_null");
    }
    if (this.isBlankText(fieldValue(record, "Category")) && category.violation === null) {
      warnings.push("blank_category_treated_as_null");
    }
    if (Object.keys(record).some((key) => !KNOWN_FIELDS.has(key))) {
      warnings.push("unknown_fields_ignored");
    }

    const violations: FieldViolation[] = [];
    for (const result of [sellerProductId, sellerName, name, brand, category]) {
      if (result.violation !== null) {
        violations.push(result.violation);
      }
    }
    const strippedSellerName = sellerName.value === null ? null : this.text.pyStrip(sellerName.value);
    if (violations.length > 0 || strippedSellerName === null || sellerProductId.value === null || name.value === null) {
      // The null checks only narrow the types: a required field without a value always has a violation.
      return {
        kind: "rejected",
        index,
        sellerName: strippedSellerName,
        sellerProductId: sellerProductId.value,
        violations,
        warnings,
      };
    }
    return {
      kind: "entry",
      index,
      sellerName: strippedSellerName,
      sellerProductId: sellerProductId.value,
      name: name.value,
      brand: brand.value,
      category: category.value,
      warnings,
    };
  }

  private sellerProductIdField(record: JsonObject): FieldResult {
    const result = this.requiredText(withIntegerIdAsText(record), "Id", MAX_SELLER_PRODUCT_ID_LENGTH);
    if (result.value !== null && !SELLER_PRODUCT_ID_PATTERN.test(result.value)) {
      return { value: null, violation: { field: "Id", code: "invalid_charset" } };
    }
    return result;
  }

  private requiredText(record: JsonObject, field: FieldName, maxLength: number): FieldResult {
    if (!Object.hasOwn(record, field)) {
      return { value: null, violation: { field, code: "missing" } };
    }
    const value = record[field];
    if (typeof value !== "string") {
      return { value: null, violation: { field, code: "not_a_string" } };
    }
    if (this.text.pyIsBlank(value)) {
      return { value: null, violation: { field, code: "blank" } };
    }
    if (this.text.pyLength(value) > maxLength) {
      return { value: null, violation: { field, code: "too_long" } };
    }
    return { value, violation: null };
  }

  private optionalText(record: JsonObject, field: FieldName, maxLength: number): FieldResult {
    const value = fieldValue(record, field);
    if (value === null) {
      return ACCEPTED_ABSENT;
    }
    if (typeof value !== "string") {
      return { value: null, violation: { field, code: "not_a_string" } };
    }
    if (this.text.pyLength(value) > maxLength) {
      return { value: null, violation: { field, code: "too_long" } };
    }
    if (this.text.pyIsBlank(value)) {
      return ACCEPTED_ABSENT;
    }
    return { value, violation: null };
  }

  private isBlankText(value: unknown): boolean {
    return typeof value === "string" && this.text.pyIsBlank(value);
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The legacy SellerProductId column was INTEGER, so a JSON integer Id names the same SKU as its
// decimal text; rewriting it to String(value) makes 12345 and "12345" resolve to one seller SKU.
// Fractional, unsafe (precision already lost) and non-number values fall through to not_a_string.
function withIntegerIdAsText(record: JsonObject): JsonObject {
  const id = Object.hasOwn(record, "Id") ? record.Id : undefined;
  return typeof id === "number" && Number.isSafeInteger(id) ? { ...record, Id: String(id) } : record;
}

// Python's dict.get: an absent key reads as None, the same as an explicit null.
function fieldValue(record: JsonObject, field: FieldName): unknown {
  return Object.hasOwn(record, field) ? record[field] : null;
}
