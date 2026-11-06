import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

export const ui = {
  alerts: [] as Array<{ title: string; message: string; buttons: Array<{ text: string; onPress?: () => unknown }> }>,
  links: [] as string[],
  shares: [] as unknown[],
  storage: new Map<string, string>(),
  assets: new Map<string, { bytes: Uint8Array; name: string; type: string }>(),
  pickFiles: async (): Promise<unknown> => ({ canceled: true }),
  pickImages: async (): Promise<unknown> => ({ canceled: true })
};
(globalThis as any).__gxlUi = ui;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const output = resolve(`dist/mobile-ui-test-${process.pid}.cjs`);
mkdirSync(resolve("dist"), { recursive: true });
const appPath = resolve("apps/mobile/App.tsx");
const mocks: Record<string, string> = {
  "react-native": `const ui=globalThis.__gxlUi; export const ${["ActivityIndicator", "Image", "Modal", "Pressable", "ScrollView", "StatusBar", "Text", "TextInput", "View"].map(name => `${name}=${JSON.stringify(name)}`).join(",")}; export const StyleSheet={create:v=>v,hairlineWidth:1}; export const Alert={alert:(title,message,buttons=[])=>ui.alerts.push({title,message,buttons})}; export const Linking={openURL:async url=>{ui.links.push(url)}}; export const Share={share:async value=>{ui.shares.push(value);return {action:'sharedAction'}}}; export const AppState={addEventListener:()=>({remove(){}})};`,
  "react-native-safe-area-context": `export const SafeAreaProvider='SafeAreaProvider',SafeAreaView='SafeAreaView'; export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
  "@expo/vector-icons": `export const Ionicons='Icon';`,
  "expo-updates": `export const isEnabled=false,isEmbeddedLaunch=true,createdAt=null,channel="test",runtimeVersion="0.8.6"; export const checkForUpdateAsync=async()=>({isAvailable:false}),fetchUpdateAsync=async()=>({}),reloadAsync=async()=>{};`,
  "expo-constants": `export default {expoConfig:{version:'0.8.6',extra:{eas:{projectId:'local-test'}}}};`,
  "@react-native-async-storage/async-storage": `const values=globalThis.__gxlUi.storage; export default {getItem:async key=>values.get(key)||null,setItem:async(key,value)=>{values.set(key,value)},removeItem:async key=>{values.delete(key)}};`,
  "expo-document-picker": `export const getDocumentAsync=(...args)=>globalThis.__gxlUi.pickFiles(...args);`,
  "expo-image-picker": `export const launchImageLibraryAsync=(...args)=>globalThis.__gxlUi.pickImages(...args); export const requestMediaLibraryPermissionsAsync=async()=>({granted:true}),requestCameraPermissionsAsync=async()=>({granted:true}),launchCameraAsync=async()=>({canceled:true});`,
  "expo-image-manipulator": `export const SaveFormat={JPEG:'jpeg'}; export const ImageManipulator={manipulate:()=>({resize(){},renderAsync:async()=>({saveAsync:async()=>({uri:'local-image',width:100,height:100,base64:'dGVzdA=='})})})};`,
  "expo-secure-store": `const values=globalThis.__gxlUi.storage; export const getItemAsync=async key=>values.get(key)||null,setItemAsync=async(key,value)=>{values.set(key,value)},deleteItemAsync=async key=>{values.delete(key)};`
};
await build({ entryPoints: [appPath], outfile: output, bundle: true, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/*"],
  define: { __DEV__: "false", "process.env.EXPO_PUBLIC_API_URL": JSON.stringify("https://local.invalid") },
  plugins: [{ name: "native-test-boundary", setup(build) {
    build.onResolve({ filter: /^(react-native|react-native-safe-area-context|@expo\/vector-icons|expo-updates|expo-constants|@react-native-async-storage\/async-storage|expo-document-picker|expo-image-picker|expo-image-manipulator|expo-secure-store)$/ }, args => ({ path: args.path, namespace: "native-mock" }));
    build.onLoad({ filter: /.*/, namespace: "native-mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    build.onLoad({ filter: /App\.tsx$/ }, args => ({ contents: readFileSync(args.path, "utf8") + '\nactiveApiToken="local-test";\nexport { App, EtsyScreen, TrendPanel, StudioPanel, PrintableStudio, SeasonalPanel, DiscoveryPanel, DigitalPanel, PhotoListingStudio, EtsyProductPlanner, EtsyPlanResult, PinterestPanel, SalesPlanCard, TrendCard, AgentScreen };', loader: "tsx", resolveDir: resolve("apps/mobile") }));
    build.onLoad({ filter: /\.(png|jpg)$/ }, () => ({ contents: 'export default "local-asset";', loader: "js" }));
  } }] });
export const screens = require(output);
export { act };
export async function mount(component: React.ComponentType<any>, props: Record<string, unknown>): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(component, props)); });
  return renderer;
}
const styleHidden = (style: any): boolean => Array.isArray(style) ? style.some(styleHidden) : style?.display === "none";
export function visible(node: ReactTestInstance): boolean {
  for (let item: ReactTestInstance | null = node; item; item = item.parent) if (styleHidden(item.props.style) || String(item.type) === "Modal" && !item.props.visible) return false;
  return true;
}
export function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : text(child)).join(""); }
export function buttons(renderer: ReactTestRenderer, pattern: RegExp): ReactTestInstance[] { return renderer.root.findAllByType("Pressable" as any).filter(node => visible(node) && !node.props.disabled && pattern.test(text(node))); }
export async function tap(renderer: ReactTestRenderer, pattern: RegExp) {
  const matches = buttons(renderer, pattern);
  if (matches.length !== 1) throw Error(`Expected one button ${pattern}, got ${matches.length}: ${matches.map(text).join(" | ")}`);
  await act(async () => { await matches[0].props.onPress(); });
}
export function field(renderer: ReactTestRenderer, label: RegExp): ReactTestInstance {
  const match = renderer.root.findAllByType("Text" as any).find(node => visible(node) && label.test(text(node)) && node.parent?.findAllByType("TextInput" as any).length === 1);
  if (!match?.parent) throw Error(`Field not found: ${label}`);
  return match.parent.findByType("TextInput" as any);
}
export async function type(renderer: ReactTestRenderer, label: RegExp, value: string) { await act(async () => { field(renderer, label).props.onChangeText(value); }); }
export async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
  throw Error("UI state did not settle");
}
export async function unmount(renderer: ReactTestRenderer) { await act(async () => { renderer.unmount(); }); }
