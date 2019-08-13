import * as fs from 'fs';
import * as _ from 'lodash';
import { readAndOutputScriptRefs } from './parsing';
import { parseJohnsIndex } from './readIndex';
import { hyphen, specSeparator } from './util';

type ChapterVerse = { chapter: string, verse?: string, note?: string };

type ChapterRange = { start?: ChapterVerse, end?: ChapterVerse, alternate?: string };

type ContiguousRef = {
  book: string,
  pageNumbers: string[],
} & ChapterRange;

type MergedContigousRef = {
  book: string,
  pageNumbers: string[],
  ranges: ChapterRange[]
};

export function readRefsAndCombineWithPrevious(fileName: string = './src/input.html') {
  const readRefs =
    // [] ||
    readAndOutputScriptRefs(fileName);
  const previousRefs = parseJohnsIndex();
  const allRefs = _.groupBy(_.flatten([..._.values(readRefs), ..._.values(previousRefs)]), 'book');
  const sortedAllRefs = _.reduce(allRefs, (bookAccum, refs, book) => {
    return {
      ...bookAccum,
      [book]: _.flatten(refs.map((ref): ContiguousRef[] => {
        const { location: _location, pageNumber, ...rest } = ref;
        const [nonBracket, bracket] = _location.split('[');
        const alternates: Array<string | undefined> = bracket ? bracket.slice(0, bracket.length - 1).split(',') : [];
        const definitelyIndependentLocations = nonBracket.split(';');
        const nonRelativeLocations = _.flatten(definitelyIndependentLocations.map((location) => {
          const maybeDependentLocations = location.split(',');
          let previousChVs: ChapterVerse | undefined;
          return maybeDependentLocations.map((loc, idx): ChapterRange => {
            const [startLoc, endLoc] = loc.split(new RegExp(hyphen));
            if (!startLoc) {
              return {
                start: undefined,
                end: undefined
              };
            }
            const alternate = alternates[idx];
            const { relative, chVs: start } = getAbsoluteOrRelativeFromPrevious(previousChVs, startLoc);
            const end = endLoc ?
              getAbsoluteOrRelativeFromPrevious(!relative ? start : previousChVs, endLoc).chVs :
              undefined;
            previousChVs = start;
            return {
              start,
              end,
              alternate,
            };
          });
        }));
        return nonRelativeLocations.map((loc) => {
          return {
            ...rest,
            pageNumbers: _.compact([pageNumber]),
            ...loc,
          };
        });
      })).sort((ref1, ref2) => {
        const startComp = compareSpecs(
          toSpecs(ref1.start),
          toSpecs(ref2.start),
        );
        if (startComp !== 0) {
          return startComp;
        }
        return compareSpecs(
          toSpecs(ref1.end),
          toSpecs(ref2.end),
        );
      }).reduce((accum, ref) => {
        const previous = accum[accum.length - 1] as ContiguousRef | undefined;
        // TODO: maybe check alternate equality and throw error if unequl when range equal
        if (previous && _.isEqual(previous.start, ref.start) && _.isEqual(previous.end, ref.end)) {
          return [
            ...accum.slice(0, accum.length - 1),
            {
              ...previous,
              ...ref,
              pageNumbers: [
                ...previous.pageNumbers,
                ...ref.pageNumbers,
              ]
            }
          ];
        }
        return [
          ...accum,
          ref
        ];
      }, [] as ContiguousRef[]).map((ref) => {
        return {
          ...ref,
          pageNumbers: _.sortBy(ref.pageNumbers, (pageNumberStr) => {
            const match = pageNumberStr.match(/^\d+/);
            if (!match) {
              throw new Error(`shouldn't have an undefined page`);
            }
            return match[0];
          })
        };
      }).reduce((accum, ref) => {
        const previous = accum[accum.length - 1] as MergedContigousRef | undefined;
        const { start, end, alternate, ...rest } = ref;
        const refRange = {
          start,
          end,
          alternate,
        };
        if (previous && _.isEqual(previous.pageNumbers, ref.pageNumbers)) {
          return [
            ...accum.slice(0, accum.length - 1),
            {
              ...previous,
              ranges: [
                ...previous.ranges,
                refRange
              ]
            }
          ];
        }
        return [
          ...accum,
          {
            ...rest,
            ranges: refRange.start && [refRange] || []
          }
        ];
      }, [] as MergedContigousRef[])

    };
  }, {} as Record<string, MergedContigousRef[]>);
  const contiguousRefsInOrderByBook = _.reduce(sortedAllRefs, (accum, refs) => [...accum, ...refs], []);
  const newIndex = contiguousRefsInOrderByBook.map(({ ranges, book, pageNumbers }, idx) =>
    `${ranges.length > 0 ?
      printRanges(ranges) :
      '\n' + book}    ${pageNumbers.join(', ') || ''}`
  ).join('\n');
  fs.writeFileSync(`${__dirname}/../src/generatedIndex.txt`, newIndex.trim());
}

function printRanges(ranges: ChapterRange[]) {
  const alternates = _.compact(ranges.map((r) => r.alternate));
  return `${_.compact(ranges.map(({ start, end }) =>
    printRange(start, end))).join('; ')}${alternates.length > 0 ? ' [' + alternates.join(', ') + ']' : ''}`;
}

function printRange(start: ChapterVerse | undefined, end: ChapterVerse | undefined) {
  return start ? `${chapterVerseToString(start)}${end ? '-' + chapterVerseToString(end) : ''}` : undefined;
}

function chapterVerseToString({ chapter, verse, note }: ChapterVerse) {
  return `${chapter}${verse ? ':' + verse : ''}${note ? '.' + note : ''}`;
}

function parseSpecs(loc: string): string[] {
  return loc.split(new RegExp(specSeparator)).map((s) => s.trim());
}

function toSpecs(chVs?: ChapterVerse) {
  if (!chVs) {
    return [];
  }
  const { chapter, verse, note } = chVs;
  return [chapter, verse, note];
}

function compareSpecs(s1: Array<string | undefined>, s2: Array<string | undefined>): number {
  const first = s1[0];
  const second = s2[0];
  if (!first && !second) {
    return 0;
  }
  if (!first) {
    return -1;
  }
  if (!second) {
    return 1;
  }

  try {
    const firstInt = parseInt(first, 10);
    const secondInt = parseInt(second, 10);
    if (firstInt !== secondInt) {
      return firstInt - secondInt;
    }
  } catch (e) {
    // ok so they're not numbers :)
    if (first !== second) {
      return first.localeCompare(second); // alpha sort
    }
  }
  return compareSpecs(s1.slice(1), s2.slice(1));
}

function getAbsoluteOrRelativeFromPrevious(
  previousChVs: ChapterVerse | undefined,
  loc: string,
): { relative: boolean, chVs: ChapterVerse } {
  const specs = parseSpecs(loc);
  const [s1, s2, s3] = specs;
  if (
    !previousChVs ||
    (!previousChVs.verse && !previousChVs.note) || // it's only a chapter, aint no relative
    specs.length === 2 && !/[a-z]/.test(s2) ||
    specs.length === 3
  ) {
    const chVs = {
      chapter: s1,
      verse: s2,
      note: s3,
    };
    return {
      relative: false,
      chVs,
    };
  }
  return {
    relative: true,
    chVs: evaluateLocationRelativeTo(previousChVs, specs, loc)
  };
}

function evaluateLocationRelativeTo(previousChVs: ChapterVerse, specs: string[], loc: string): ChapterVerse {
  const [s1, s2, s3] = specs;
  if (specs.length === 2) {
    return {
      ...previousChVs,
      verse: s1,
      note: s2,
    };

  } else if (specs.length === 1) {
    if (/[a-z]/.test(s1)) {
      return {
        ...previousChVs,
        note: s1,
      };

    }
    return {
      chapter: previousChVs.chapter,
      verse: s1
    };
  } else {
    console.warn(`HOOWWWW??? specs length 1 should be non relative, specs: ${specs}, loc: ${loc}`);
    return {
      ...previousChVs,
      verse: s1,
      note: s2,
    };
  }
}