interface LocalFile { uri: string; name?: string; fileName?: string; mimeType?: string; file?: Blob; }

/** React Native accepts a URI descriptor; browsers require actual file bytes. */
export async function appendLocalFile(form: FormData, field: string, asset: LocalFile, name: string, type: string): Promise<void> {
  if (typeof document !== "undefined") {
    let file=asset.file;
    if(!file){const response=await fetch(asset.uri);if(!response.ok)throw Error("Seçilen dosya okunamadı.");file=await response.blob();}
    if(!file.size)throw Error("Seçilen dosya boş.");
    form.append(field,file.type?file:new Blob([file],{type}),name);
  } else form.append(field,{uri:asset.uri,name,type} as any);
}
