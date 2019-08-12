import * as fs from 'fs';


//<p class="s19" style="padding-top: 4pt;padding-left: 40pt;text-indent: 0pt;text-align: left;">102 Introduction</p>
const SECTIONS_REG_EX = /<p class="s19" style=".*?">.*?([0-9]+).*?<\/p>/g

type PTagInfo = { pTag: string, pageNumber: string };

export function readAndOutputScriptRefs(fileName: string = './src/input.html') {
  const fileText = fs.readFileSync(fileName).toString();
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

  const pageTexts = pTagInfos.reduce((accum, { pTag, pageNumber }, idx) => {
    const nextPTagInfo: PTagInfo | undefined = pTagInfos[idx + 1];
    const pageTextRegExp = new RegExp(`${escapeRegex(pTag)}((.|\\n)*)(${nextPTagInfo && escapeRegex(nextPTagInfo.pTag) || ''})`);
    // console.log(pageTextRegExp);
    const pageTextMatch = fileText.match(pageTextRegExp);
    const pageText = pageTextMatch && pageTextMatch[1];
    // console.log(`matched pageText: "${pageText}"`);
    const refs = findRefsInString(pageText);
    return {
      ...accum,
      [pageNumber]: refs
    }
  }, {} as Record<string, string[]>)
}

function escapeRegex(text: string) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
};

function findRefsInString(text: string | null): string[] {
  return [];
}