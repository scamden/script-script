export type BookRef = { book: string, pageNumber?: string, location: string };

export function getAllFromMatches<T>(regex: RegExp, text: string, matchCb: (matches: RegExpExecArray) => T) {
  let match = regex.exec(text);
  const results: T[] = [];
  while (match) {
    results.push(matchCb(match));
    match = regex.exec(text);
  }
  return results;
}

export function escapeRegex(text: string) {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export const specSeparator = `[:\\.]`;
export const hyphen = `[-–—−]`;