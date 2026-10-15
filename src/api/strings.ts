import { useConfig } from "@/config";

import { fetchCard, getCardStr } from "./cards";

let { stringsUrl } = useConfig();
export const DESCRIPTION_LIMIT = 10000;

export async function initStrings() {
  const language = localStorage.getItem("language") || "cn";

  //It currently only supports en-US, es-ES, ja-JP, ko-KR, zh-CN
  switch (language) {
    case "en":
    case "br":
    case "pt":
    case "fr":
      stringsUrl = stringsUrl.replace("zh-CN", "en-US");
      break;
    case "ja":
      stringsUrl = stringsUrl.replace("zh-CN", "ja-JP");
      break;
    case "es":
      stringsUrl = stringsUrl.replace("zh-CN", "es-ES");
      break;
    case "ko":
      stringsUrl = stringsUrl.replace("zh-CN", "ko-KR");
      break;
    default:
      break;
  }

  const strings = await (await fetch(stringsUrl)).text();

  const lineIter = strings.split("\n");
  for (const line of lineIter) {
    if (!line.startsWith("#") && line !== "") {
      let [region, code, value] = line.split(" ", 3);
      try {
        localStorage.setItem(`${region}_${code}`, value);
      } catch (error) {
        alert(`set item in local storage error: ${error}`);
        break;
      }
    }
  }
}

export enum Region {
  System = "!system",
  Victory = "!victory",
  Counter = "!counter",
}

export function fetchStrings(region: Region, id: string | number): string {
  return localStorage.getItem(`${region}_${id}`) ?? "?";
}

export function getStrings(
  description: number,
  includeFullRules = true,
): string {
  if (description < DESCRIPTION_LIMIT) {
    return fetchStrings(Region.System, description);
  } else {
    const code = description >> 4;
    const index = description & 0xf;

    const meta = fetchCard(code);
    // Some real cards leave individual strN slots empty. The full rules
    // text is still available and must not turn a prompt into a blank box.
    return (
      getCardStr(meta, index)?.trim() ||
      (includeFullRules ? meta.text.desc?.trim() : "") ||
      (includeFullRules ? meta.text.name : "") ||
      "[?]"
    );
  }
}
