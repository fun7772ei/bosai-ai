// Pure transcript state for the existing pinned Moonshine MicTranscriber.
// onText is provisional. onLine is committed (line ids are opaque strings).
// No audio, drafts or content are stored outside the active page.
export class VoiceDraft {
  constructor(){this.begin('');}
  begin(base=''){
    this.base=String(base);
    this.lines=new Map();
    this.pendingLines=new Map();
    this.partial='';
    this.edited=false;
    this.count=0;
    this.provisionalAtStop=false;
  }
  get value(){return [this.base,...this.lines.values(),...this.pendingLines.values(),this.partial].filter(Boolean).join(' ').trim();}
  get committed(){return [...this.lines.values()].join(' ').trim();}
  update(line){
    if(line?.id==null)return;
    const id=String(line.id),text=String(line.text??'').trim();
    if(line.isComplete){this.lines.set(id,text);this.pendingLines.delete(id);}
    else if(!this.lines.has(id))this.pendingLines.set(id,text);
    return this.value;
  }
  interim(text){this.partial=String(text??'').trim();return this.value;}
  commit(line){
    const text=String(line?.text??'').trim();
    if(!text)return this.value;
    // SDK v0.1.5 TranscriptLine.id is a 64-bit opaque decimal string.
    // Repeated id updates replace a line instead of appending it twice.
    const id=line?.id!=null?String(line.id):'missing-'+(++this.count);
    this.lines.set(id,text);
    this.partial='';
    return this.value;
  }
  noteManualChange(value){if(String(value)!==this.value)this.edited=true;}
  stop(){
    this.provisionalAtStop=!!this.partial||this.pendingLines.size>0;
    // Deliberately retain the last partial. The SDK might not commit it.
    return {text:this.value,provisional:this.provisionalAtStop,manuallyEdited:this.edited};
  }
}
