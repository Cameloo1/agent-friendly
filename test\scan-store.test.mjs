import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ScanStore,
  ScanStoreError,
  resolveScanRoot,
} from "../plugins/is-it-agent-ready/src/scan-store.mjs";

test("resolves platform-specific scan roots without writing to the repository", () => {
  assert.equal(
    resolveScanRoot({
      env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
      platform: "win32",
      homeDirectory: "C:\\Users\\tester",
    }),
    path.win32.join("C:\\Users\\tester\\AppData\\Local", "is-it-agent-ready", "scans"),
  );
  assert.equal(
    resolveScanRoot({
      env: { XDG_STATE_HOME: "/var/tmp/state" },
      platform: "linux",
      homeDirectory: "/home/tester",
    }),
    path.posix.join("/var/tmp/state", "is-it-agent-ready", "scans"),
  );
  assert.equal(
    resolveScanRoot({ env: {}, platform: "darwin", homeDirectory: "/Users/tester" }),
    path.posix.join("/Users/tester", "Library", "Application Support", "is-it-agent-ready", "scans"),
  );
});

test("requires an absolute explicit storage path", () => {
  assert.throws(
    () => resolveScanRoot({ env: { IS_IT_AGENT_READY_SCAN_DIR: "relative/scans" } }),
    ScanStoreError,
  );
});

test("atomically saves JSON, Markdown,-½÷Ží¢G§²ÚîÆ­yÓ°¢6öç7B¶ÆVgE&rÂ&–v‡E&rÒ"%ÒÒ–çWBç7Æ—B‚#£¢"“°¢6öç7BÆVgBÒÆVgE&rÓÓÒ""òµÒ¢ÆVgE&rç7Æ—B‚#¢"“°¢6öç7B&–v‡BÒ&–v‡E&rÓÓÒ""òµÒ¢&–v‡E&rç7Æ—B‚#¢"“°¢–b…²ââæÆVgBÂââç&–v‡EÒç6öÖR‚‡v÷&B’Óâõå³Ó–Öe×³ÃGÒBòçFW7B‡v÷&B’’’&WGW&âçVÆÃ° ¢6öç7BÖ—76–ærÒ‚ÒÆVgBæÆVæwF‚Ò&–v‡BæÆVæwFƒ°¢–b†–çWBæ–æ6ÇVFW2‚#£¢"’’°¢–b†Ö—76–ærÂ’&WGW&âçVÆÃ°¢ÒVÇ6R–b†Ö—76–ærÓÒ’°¢&WGW&âçVÆÃ°¢Ð ¢&WGW&â²ââæÆVgBÂââä'&’„ÖF‚æÖ‚†Ö—76–ærÂ’’æf–ÆÂ‚#"’Âââç&–v‡EÒæÖ‚‡v÷&B’Óà¢çVÖ&W"ç'6T–çB‡v÷&BÂb’À¢“°§Ð ¦W‡÷'BgVæ7F–öâ—4&Æö6¶VD•cb†FG&W72’°¢6öç7Bv÷&G2Ò'6T•cb†FG&W72“°¢–b‚v÷&G2ÇÂv÷&G2æÆVæwF‚ÓÒ‚’&WGW&âG'VS° ¢6öç7BÆÅ¦W&òÒv÷&G2æWfW'’‚‡v÷&B’Óâv÷&BÓÓÒ“°¢6öç7BÆö÷&6²Òv÷&G2ç6Æ–6RƒÂr’æWfW'’‚‡v÷&B’Óâv÷&BÓÓÒ’bbv÷&G5³uÒÓÓÒ°¢6öç7B—cD6ö×F–&ÆRÒv÷&G2ç6Æ–6RƒÂb’æWfW'’‚‡v÷&B’Óâv÷&BÓÓÒ“°¢6öç7B—cDÖVBÒv÷&G2ç6Æ–6RƒÂR’æWfW'’‚‡v÷&B’Óâv÷&BÓÓÒ’bbv÷&G5³UÒÓÓÒ†fffc°¢6öç7BVæ—VTÆö6ÂÒ‡v÷&G5³Òb†fS’ÓÓÒ†f3°¢6öç7BÆ–æ´Æö6ÂÒ‡v÷&G5³Òb†ff3’ÓÓÒ†fSƒ°¢6öç7B6—FTÆö6ÂÒ‡v÷&G5³Òb†ff3’ÓÓÒ†fV3°¢6öç7B×VÇF–67BÒ‡v÷&G5³Òb†fc’ÓÓÒ†fc°¢6öç7BF—66&DöæÇ’Òv÷&G5³ÒÓÓÒƒbbv÷&G2ç6Æ–6RƒÂB’æWfW'’‚‡v÷&B’Óâv÷&BÓÓÒ“°¢6öç7BFö7VÖVçFF–öâÒv÷&G5³ÒÓÓÒƒ#bbv÷&G5³ÒÓÓÒƒF#ƒ°¢6öç7B&Væ6†Ö&¶–ærÒv÷&G5³ÒÓÓÒƒ#bbv÷&G5³ÒÓÓÒƒ"bbv÷&G5³%ÒÓÓÒ°¢6öç7BÆö6ÅG&ç6ÆF–öâÒv÷&G5³ÒÓÓÒƒcBbbv÷&G5³ÒÓÓÒ†fc–"bbv÷&G5³%ÒÓÓÒ° ¢&WGW&â€¢ÆÅ¦W&òÇÀ¢Æö÷&6²ÇÀ¢—cD6ö×F–&ÆRÇÀ¢—cDÖVBÇÀ¢Væ—VTÆö6ÂÇÀ¢Æ–æ´Æö6ÂÇÀ¢6—FTÆö6ÂÇÀ¢×VÇF–67BÇÀ¢F—66&DöæÇ’ÇÀ¢Fö7VÖVçFF–öâÇÀ¢&Væ6†Ö&¶–ærÇÀ¢Æö6ÅG&ç6ÆF–öà¢“°§Ð ¦W‡÷'BgVæ7F–öâ76W'EV&Æ–4FG&W72†FG&W72’°¢6öç7BfÖ–Ç’Ò—4•†FG&W72“°¢–b†fÖ–Ç’ÓÓÒBbb—4&Æö6¶VD•cB†FG&W72’’°¢&V¦V7B†&VgW6–æræöâ×V&Æ–2•cBFG&W72G¶FG&W77ÒæÂ&æöå÷V&Æ–5öFG&W72"“°¢Ð¢–b†fÖ–Ç’ÓÓÒbbb—4&Æö6¶VD•cb†FG&W72’’°¢&V¦V7B†&VgW6–æræöâ×V&Æ–2•cbFG&W72G¶FG&W77ÒæÂ&æöå÷V&Æ–5öFG&W72"“°¢Ð¢–b†fÖ–Ç’ÓÓÒ’&V¦V7B†&W6öÇfW"&WGW&æVBâ–çfÆ–BFG&W73¢G¶FG&W77ÒæÂ&–çfÆ–E÷&W6öÇWF–öâ"“°§Ð ¦W‡÷'B7–æ2gVæ7F–öâfÆ–FFUV&Æ–5F&vWB‡&rÂ²Æöö·WÒFVfVÇDÆöö·WÒÒ·Ò’°¢–b‡G—Vöb&rÓÒ'7G&–ær"ÇÂ&rçG&–Ò‚’ÓÓÒ""’°¢&V¦V7B‚%66âF&vWB×W7B&RæöâÖV×G’'6öÇWFRU$Ââ"Â&–çfÆ–E÷W&Â"“°¢Ð ¢ÆWB'6VC°¢G'’°¢'6VBÒæWrU$Â‡&r“°¢Ò6F6‚°¢&V¦V7B‚%66âF&vWB×W7B&RfÆ–B'6öÇWFRU$Ââ"Â&–çfÆ–E÷W&Â"“°¢Ð ¢–b‡'6VBç&÷Fö6öÂÓÒ&‡GG¢"bb'6VBç&÷Fö6öÂÓÒ&‡GG3¢"’°¢&V¦V7B‚%66âF&vWB×W7BW6R‡GG÷"‡GG2â"Â&–çfÆ–E÷66†VÖR"“°¢Ð¢–b‡'6VBçW6W&æÖRÇÂ'6VBç77v÷&B’°¢&V¦V7B‚%66âF&vWB×W7Bæ÷B6öçF–âW6W&æÖR÷"77v÷&Bâ"Â&7&VFVçF–Ç5ö–å÷W&Â"“°¢Ð¢–b‡'6VBç6V&6‚’°¢&V¦V7B‚%66âF&vWB×W7Bæ÷B6öçF–âVW'’7G&–æs²&÷f–FRF†RV&Æ–26—FRU$ÂöæÇ’â"Â'VW'•ö–å÷W&Â"“°¢Ð¢–b‡'6VBæ†6‚’°¢&V¦V7B‚%66âF&vWB×W7Bæ÷B6öçF–âg&vÖVçC²&÷f–FRF†RV&Æ–26—FRU$ÂöæÇ’â"Â&g&vÖVçEö–å÷W&Â"“°¢Ð ¢6öç7B†÷7BÒæ÷&ÖÆ—¦T†÷7FæÖR‡'6VBæ†÷7FæÖR“°¢–b‚†÷7B’&V¦V7B‚%66âF&vWB×W7B6öçF–â†÷7FæÖRâ"Â&Ö—76–æuö†÷7FæÖR"“°¢–b„$Äô4´TEô„õ5E2æ†2††÷7B’ÇÂ$Äô4´TEõ5Tdd•„U2ç6öÖR‚‡7Vff—‚’Óâ†÷7BæVæG5v—F‚‡7Vff—‚’’’°¢&V¦V7B†&VgW6–ærÆö6Â÷"–çFW&æÂ†÷7FæÖRG¶†÷7GÒæÂ&–çFW&æÅö†÷7FæÖR"“°¢Ð ¢6öç7BÆ—FW&ÄfÖ–Ç’Ò—4•††÷7B“°¢–b†Æ—FW&ÄfÖ–Ç’â’°¢76W'EV&Æ–4FG&W72††÷7B“°¢ÒVÇ6R°¢–b‚†÷7Bæ–æ6ÇVFW2‚"â"’’&V¦V7B†&VgW6–ær6–ævÆRÖÆ&VÂ–çG&æWB†÷7FæÖRG¶†÷7GÒæÂ&–çFW&æÅö†÷7FæÖR"“° ¢ÆWB&W6öÇfVC°¢G'’°¢&W6öÇfVBÒv—BÆöö·W††÷7BÂ²ÆÃ¢G'VRÂfW&&F–Ó¢G'VRÒ“°¢Ò6F6‚†W'&÷"’°¢&V¦V7B†6÷VÆBæ÷B&W6öÇfR66âF&vWBG¶†÷7GÓ¢G¶W'&÷"æÖW76vWÖÂ&Fç5÷&W6öÇWF–öåöf–ÆVB"“°¢Ð ¢–b‚'&’æ—4'&’‡&W6öÇfVB’ÇÂ&W6öÇfVBæÆVæwF‚ÓÓÒ’°¢&V¦V7B†66âF&vWBG¶†÷7GÒF–Bæ÷B&W6öÇfRFòâFG&W72æÂ&Fç5÷&W6öÇWF–öåöf–ÆVB"“°¢Ð¢f÷"†6öç7B&V6÷&Böb&W6öÇfVB’76W'EV&Æ–4FG&W72‡&V6÷&BæFG&W72“°¢Ð ¢&WGW&â'6VBçFõ7G&–ær‚“°§Ð 