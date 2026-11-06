import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root=resolve(import.meta.dirname,"../.."),output=resolve(process.argv[2]||resolve(root,"dist/web-test"));
await mkdir(output,{recursive:true});
const source=execFileSync("git",["rev-parse","--short","HEAD"],{cwd:root,encoding:"utf8"}).trim();
await build({absWorkingDir:root,entryPoints:["apps/web-test/entry.tsx"],outdir:output,bundle:true,format:"esm",splitting:true,minify:true,metafile:true,platform:"browser",alias:{react:resolve(root,"node_modules/react"),"react-dom":resolve(root,"node_modules/react-dom")},target:["es2022"],jsx:"automatic",entryNames:"app",chunkNames:"assets/chunk-[hash]",assetNames:"assets/[name]-[hash]",nodePaths:[resolve(root,"apps/mobile/node_modules"),resolve(root,"node_modules")],resolveExtensions:[".web.tsx",".tsx",".web.ts",".ts",".web.js",".js",".json"],mainFields:["browser","module","main"],conditions:["browser","import","default"],define:{global:"globalThis",__DEV__:"false","process.env.NODE_ENV":'"production"',"process.env.EXPO_PUBLIC_API_URL":'"/__gxl_sandbox"',"process.env.EXPO_PUBLIC_WEB_SANDBOX":"\"true\"","process.env.EXPO_OS":'"web"'},loader:{".js":"jsx",".jpg":"file",".png":"file",".ttf":"file",".webp":"file"},plugins:[{name:"web-native-boundaries",setup(api){const aliases={"react-native":"native-web.ts","expo-secure-store":"secure-store.ts","expo-updates":"updates.ts","expo-constants":"constants.ts","@expo/vector-icons":"icons.tsx"};api.onResolve({filter:/^(react-native|expo-secure-store|expo-updates|expo-constants|@expo\/vector-icons)$/},args=>({path:resolve(root,"apps/web-test",aliases[args.path])}));}}]});
const template=await readFile(resolve(root,"apps/web-test/index.html"),"utf8");
await writeFile(resolve(output,"index.html"),template.replaceAll("__SOURCE_REVISION__",source));
console.log(`Built shared app and isolated Worker sandbox at ${output} (${source})`);
