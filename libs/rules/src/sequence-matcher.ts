// Port of CPython 3.12 difflib.SequenceMatcher, fixed to isjunk=None and autojunk=False: the
// fuzzy scores land in the review queue and the run report, so they must be bit-identical to the
// Python tool's doubles. Statement order follows difflib.py on purpose; do not "simplify" it.

export interface Match {
  readonly a: number;
  readonly b: number;
  readonly size: number;
}

type Range = readonly [alo: number, ahi: number, blo: number, bhi: number];

const NOTHING: readonly number[] = [];

function calculateRatio(matches: number, length: number): number {
  return length ? (2 * matches) / length : 1;
}

// Python iterates a str by code point; Array.from does the same, so lengths and ratio
// denominators match even if a key ever carried a character outside the BMP.
function toElements(text: string): readonly string[] {
  return Array.from(text);
}

function compareMatches(left: Match, right: Match): number {
  if (left.a !== right.a) {
    return left.a - right.a;
  }
  if (left.b !== right.b) {
    return left.b - right.b;
  }
  return left.size - right.size;
}

export class SequenceMatcher {
  private sourceA: string | null = null;
  private sourceB: string | null = null;
  private a: readonly string[] = [];
  private b: readonly string[] = [];
  private b2j = new Map<string, number[]>();
  // Always empty with isjunk=None and autojunk=False; kept so the extension loops read as CPython's.
  private bjunk = new Set<string>();
  private bpopular = new Set<string>();
  private fullBCount: Map<string, number> | null = null;
  private matchingBlocks: readonly Match[] | null = null;

  constructor(a: string, b: string) {
    this.setSeq1(a);
    this.setSeq2(b);
  }

  setSeq1(a: string): void {
    if (a === this.sourceA) {
      return;
    }
    this.sourceA = a;
    this.a = toElements(a);
    this.matchingBlocks = null;
  }

  setSeq2(b: string): void {
    if (b === this.sourceB) {
      return;
    }
    this.sourceB = b;
    this.b = toElements(b);
    this.matchingBlocks = null;
    this.fullBCount = null;
    this.chainB();
  }

  private chainB(): void {
    const b2j = new Map<string, number[]>();
    this.b.forEach((element, index) => {
      const indexes = b2j.get(element);
      if (indexes === undefined) {
        b2j.set(element, [index]);
      } else {
        indexes.push(index);
      }
    });
    this.b2j = b2j;
    // No isjunk predicate and no autojunk heuristic: nothing is removed from b2j.
    this.bjunk = new Set<string>();
    this.bpopular = new Set<string>();
  }

  private isBJunk(element: string | undefined): boolean {
    return element !== undefined && this.bjunk.has(element);
  }

  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Match {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i += 1) {
      const newj2len = new Map<number, number>();
      const element = a[i];
      const indexes = element === undefined ? NOTHING : (b2j.get(element) ?? NOTHING);
      for (const j of indexes) {
        if (j < blo) {
          continue;
        }
        if (j >= bhi) {
          break;
        }
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }

    // CPython's four extension loops. With an empty bjunk and every element in b2j they never
    // iterate (the scan above already found a maximal block); they stay for line-by-line parity.
    while (besti > alo && bestj > blo && !this.isBJunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      !this.isBJunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }
    while (besti > alo && bestj > blo && this.isBJunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      this.isBJunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }

    return { a: besti, b: bestj, size: bestsize };
  }

  getMatchingBlocks(): readonly Match[] {
    if (this.matchingBlocks !== null) {
      return this.matchingBlocks;
    }
    const la = this.a.length;
    const lb = this.b.length;
    // An explicit stack rather than recursion, as CPython does, so long keys cannot overflow.
    const queue: Range[] = [[0, la, 0, lb]];
    const found: Match[] = [];
    for (let range = queue.pop(); range !== undefined; range = queue.pop()) {
      const [alo, ahi, blo, bhi] = range;
      const block = this.findLongestMatch(alo, ahi, blo, bhi);
      const { a: i, b: j, size: k } = block;
      if (k > 0) {
        found.push(block);
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j]);
        }
        if (i + k < ahi && j + k < bhi) {
          queue.push([i + k, ahi, j + k, bhi]);
        }
      }
    }
    found.sort(compareMatches);

    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    const nonAdjacent: Match[] = [];
    for (const { a: i2, b: j2, size: k2 } of found) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) {
          nonAdjacent.push({ a: i1, b: j1, size: k1 });
        }
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) {
      nonAdjacent.push({ a: i1, b: j1, size: k1 });
    }
    nonAdjacent.push({ a: la, b: lb, size: 0 });
    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  ratio(): number {
    let matches = 0;
    for (const block of this.getMatchingBlocks()) {
      matches += block.size;
    }
    return calculateRatio(matches, this.a.length + this.b.length);
  }

  quickRatio(): number {
    // Viewing a and b as multisets, matches is the size of their intersection: an upper bound on
    // ratio() that ignores order.
    let fullBCount = this.fullBCount;
    if (fullBCount === null) {
      fullBCount = new Map<string, number>();
      for (const element of this.b) {
        fullBCount.set(element, (fullBCount.get(element) ?? 0) + 1);
      }
      this.fullBCount = fullBCount;
    }
    // avail[x] is the count of x in b less the times x was already seen in a.
    const avail = new Map<string, number>();
    let matches = 0;
    for (const element of this.a) {
      const numb = avail.get(element) ?? fullBCount.get(element) ?? 0;
      avail.set(element, numb - 1);
      if (numb > 0) {
        matches += 1;
      }
    }
    return calculateRatio(matches, this.a.length + this.b.length);
  }

  realQuickRatio(): number {
    const la = this.a.length;
    const lb = this.b.length;
    return calculateRatio(Math.min(la, lb), la + lb);
  }
}
