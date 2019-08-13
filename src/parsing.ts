import * as fs from 'fs';
import * as _ from 'lodash';
import { BookRef, escapeRegex, getAllFromMatches, hyphen, specSeparator } from './util';

const SECTIONS_REG_EX = /<p class="s19" style=".*?">.*?([0-9]+).*?<\/p>/g;
const locSeparator = `[\\,\\;]`;
// please note that the hyphens are actually different characters
const hyphensOrComma = `${locSeparator} ?|${hyphen}`;
const locationRegExStr = `(\\d+${specSeparator}\\d+|\\d+|${hyphensOrComma})+`;

type PTagInfo = { pTag: string, pageNumber: string };
const targets = readTargets();
const targetsSansDaniel = targets.filter((t) => t !== 'Daniel');
// Gen 1, 4, 7 // Gen 1:4, 5:3 // Gen 1:4, 5 //Gen 1, 5:3
// tslint:disable-next-line: max-line-length
const makeRegExFromTargets = (passedTargets: string[]) => `(${passedTargets.map((t) => escapeRegex(t)).join('|')})`;
const targetRegExStr = makeRegExFromTargets(targets);
// tslint:disable-next-line: max-line-length
const refRegExp = new RegExp(`((${targetRegExStr}( (${locationRegExStr})( \\[${locationRegExStr}\\])?))|\\b${makeRegExFromTargets(targetsSansDaniel)}\\b)`, 'g');
console.log(refRegExp);

function readTargets() {
  const fileText = fs.readFileSync(`${__dirname}/../src/targets.md`).toString();
  return _.compact(fileText.split('\n'));
}

export function readAndOutputScriptRefs(fileName: string = './src/input.html', pageStart: number = 98) {
  const fileText = fs.readFileSync(fileName).toString();

  const pTagInfos = readPTagInfos(fileText);
  const bookRefs = _.flatten(pTagInfos.map(({ pTag, pageNumber }, idx) => {
    const nextPTagInfo: PTagInfo | undefined = pTagInfos[idx + 1];
    const pageTextRegExp = new RegExp(`${escapeRegex(pTag)}((.|\\n)*)(${nextPTagInfo && escapeRegex(nextPTagInfo.pTag) || ''})`);
    const pageTextMatch = fileText.match(pageTextRegExp);
    const pageText = pageTextMatch && pageTextMatch[1];
    if (parseInt(pageNumber, 10) < pageStart) {
      return [];
    }
    console.log('\n', pageNumber, '\n');
    return findRefsInString(pageText, pageNumber);
  }));
  const newBooks = _.groupBy(bookRefs, 'book');
  return newBooks;
}

function readPTagInfos(fileText: string): PTagInfo[] {
  return getAllFromMatches(SECTIONS_REG_EX, fileText, (match) => {
    const pTag = match[0];
    const pageNumber = match[1];
    return {
      pTag,
      pageNumber,
    };
  });
}

function findRefsInString(text: string | null, pageNumber: string): BookRef[] {
  if (!text) {
    return [];
  }

  const preProcessedText = text.replace(/<i>.*?<\/i>/g, '');
  return getAllFromMatches(refRegExp, preProcessedText, (match) => {
    // console.log(_.omit(match, 'input'));
    const book = (match[3] || match[9]).trim();
    const location = match[5] ? match[5].replace(new RegExp(`(${hyphensOrComma})$`), '').trim() : '';
    console.log(book, location || '');
    return {
      book,
      location,
      pageNumber,
    };
  });
}