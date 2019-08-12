import * as fs from 'fs';
import * as _ from 'lodash';

//<p class="s19" style="padding-top: 4pt;padding-left: 40pt;text-indent: 0pt;text-align: left;">102 Introduction</p>
const SECTIONS_REG_EX = /<p class="s19" style=".*?">.*?([0-9]+).*?<\/p>/g
const targets = readTargets();
const locationRegExStr = '(\\d+|\\d\\:\\d|, |-|–|—|−)' // please note that the hyphens are actually different characters

// Gen 1, 4, 7 // Gen 1:4, 5:3 // Gen 1:4, 5 //Gen 1, 5:3
const refRegExp = new RegExp(`(${targets.map(t => escapeRegex(t)).join('|')} ${locationRegExStr}+)`);

type PTagInfo = { pTag: string, pageNumber: string };


export function readAndOutputScriptRefs(fileName: string = './src/input.html') {
  const fileText = fs.readFileSync(fileName).toString();


  const pTagInfos = readPTagInfos(fileText);
  const pageTexts = pTagInfos.reduce((accum, { pTag, pageNumber }, idx) => {
    const nextPTagInfo: PTagInfo | undefined = pTagInfos[idx + 1];
    const pageTextRegExp = new RegExp(`${escapeRegex(pTag)}((.|\\n)*)(${nextPTagInfo && escapeRegex(nextPTagInfo.pTag) || ''})`);
    const pageTextMatch = fileText.match(pageTextRegExp);
    const pageText = pageTextMatch && pageTextMatch[1];
    const refs = findRefsInString(pageText);
    return {
      ...accum,
      [pageNumber]: refs
    }
  }, {} as Record<string, string[]>)
  console.log(JSON.stringify(pageTexts, null, 2));
}

function readPTagInfos(fileText: string) {
  let match = SECTIONS_REG_EX.exec(fileText);
  let pTagInfos: PTagInfo[] = [];
  while (match) {
    const pTag = match && match[0];
    console.log(pTag);
    const pageNumber = match && match[1];
    console.log(pageNumber);
    pTagInfos.push({
      pTag,
      pageNumber,
    })
    match = SECTIONS_REG_EX.exec(fileText)
  }
  return pTagInfos;
}

function findRefsInString(text: string | null): string[] {
  let refs: string[] = [];
  let match = text && text.match(refRegExp);
  while (match && text) {
    refs.push(match[1]);
    text.match(refRegExp)
  }
  return refs;
}

function readTargets() {
  const fileText = fs.readFileSync(`${__dirname}/targets.md`).toString();
  return _.compact(fileText.split('\n'))
}

function escapeRegex(text: string) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
};

