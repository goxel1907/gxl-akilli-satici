import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../mobile/${path}`, import.meta.url), "utf8"));

// APK kurmadan giden güncelleme (EAS Update) yalnız aynı "version" ile derlenmiş APK'ye gider.
// Paket listesi değişip sürüm aynı kalırsa yeni JavaScript eski APK'de olmayan bir modülü arar ve uygulama açılmaz.
test("a new or changed app package always comes with a new app version and APK", () => {
  const app = read("app.json").expo;
  const pkg = read("package.json");
  const snapshot = read("native-modules.json");
  assert.equal(app.runtimeVersion?.policy, "appVersion", "updates must target the APK built with the same app version");
  assert.equal(app.updates?.url, `https://u.expo.dev/${app.extra.eas.projectId}`);
  assert.equal(snapshot.appVersion, app.version, "app.json version changed: update apps/mobile/native-modules.json to the new version and its packages");
  assert.deepEqual(pkg.dependencies, snapshot.dependencies, "app packages changed: raise app.json version (a new APK is needed), then update apps/mobile/native-modules.json");
});

test("every APK build profile listens to an update channel and updates are published to the preview APK's channel", () => {
  const eas = read("eas.json");
  assert.equal(eas.build.preview.channel, "preview");
  assert.equal(eas.build.production.channel, "production");
  // GitHub Actions bu hesapta ödeme kilidiyle çalışmıyor; güncellemeyi Expo'nun iş akışı yayınlar.
  const workflow = readFileSync(new URL("../../mobile/.eas/workflows/publish-update.yml", import.meta.url), "utf8");
  assert.match(workflow, /^\s+type: update$/m);
  assert.match(workflow, /^\s+branch: preview$/m, "the workflow must publish to the branch the preview APK listens to");
  assert.match(workflow, /^\s+platform: android$/m);
});

// Geçici internet kesintisinde kayıtlı bağlantı anahtarı silinmemeli; silme yalnız sunucu anahtarı reddedince
// ve onay sorulduktan sonra yapılır. Güncelleme gelmediğinde nedeni Özet'teki düğmeyle görülebilmeli.
test("a dropped connection offers a retry and never deletes the saved key without asking", () => {
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /onPress=\{resetApiToken\}/, "deleting the saved key must go through the confirmation dialog");
  assert.match(app, /reason === "key" && <Pressable style=\{styles\.offlineButton\} onPress=\{onResetKey\}>/);
  assert.match(app, /response\.status === 401 \? "key" : "server"/);
  assert.match(app, /<OfflineNotice reason=\{offlineReason\} busy=\{reconnecting\} onRetry=\{reconnect\} onResetKey=\{confirmResetToken\} \/>/);
  assert.match(app, /<UpdateCheckButton \/>/);
});
