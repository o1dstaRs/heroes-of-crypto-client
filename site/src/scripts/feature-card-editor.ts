import { FEATURE_CARD_ROSTER, resolveFeatureCardUnit } from '../lib/feature-card-roster';

interface Slot { faction: string; creature: string; x: number; y: number; scale: number; flip: boolean }
interface Config { spellVariant: number; slots: Slot[] }
const data = JSON.parse(document.querySelector('#editor-data')!.textContent!) as { config: Config };
const config = structuredClone(data.config);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let selected = 0;
let dirty = false;
const creature = $<HTMLSelectElement>('creature');
const scale = $<HTMLInputElement>('scale');
const x = $<HTMLInputElement>('position-x');
const y = $<HTMLInputElement>('position-y');
const flip = $<HTMLInputElement>('flip');
const stage = $('editor-stage');
const status = $('status');
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
function render() {
    document.querySelectorAll<HTMLElement>('[data-slot]').forEach(el => {
        const i = Number(el.dataset.slot), slot = config.slots[i];
        const image = el.querySelector('img')!;
        const unit = resolveFeatureCardUnit(i, slot.creature);
        if (!unit) return;
        if (image.getAttribute('src') !== unit.src) image.src = unit.src;
        image.style.left = `${50 + slot.x}%`;
        image.style.top = `${50 + slot.y}%`;
        image.style.transform = `translate(-50%, -50%) scale(${slot.flip ? -slot.scale : slot.scale}, ${slot.scale})`;
        if (el.hasAttribute('role')) el.setAttribute('aria-pressed', String(i === selected));
    });
    const slot = config.slots[selected];
    scale.value = String(Math.round(slot.scale * 100));
    $('scale-value').textContent = `${Math.round(slot.scale * 100)}%`;
    x.value = String(Math.round(slot.x * 10) / 10);
    y.value = String(Math.round(slot.y * 10) / 10);
    flip.checked = slot.flip;
}
function change() { dirty = true; status.textContent = 'Есть несохранённые изменения.'; render(); }
function select(index: number) {
    selected = index;
    $('slot-title').textContent = FEATURE_CARD_ROSTER[index].faction;
    creature.replaceChildren(...FEATURE_CARD_ROSTER[index].units.map(unit => new Option(unit.name, unit.slug)));
    creature.value = config.slots[index].creature;
    document.querySelectorAll<HTMLElement>('[data-select-slot]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.selectSlot) === index)));
    render();
}
document.querySelectorAll<HTMLElement>('[data-select-slot]').forEach(button => button.addEventListener('click', () => select(Number(button.dataset.selectSlot))));
creature.addEventListener('change', () => { Object.assign(config.slots[selected], {creature: creature.value, x: 0, y: 0, scale: 1}); change(); });
scale.addEventListener('input', () => { config.slots[selected].scale = Number(scale.value) / 100; change(); });
for (const [input,key] of [[x,'x'],[y,'y']] as const) input.addEventListener('input', () => { const n = Number(input.value); if (Number.isFinite(n)) config.slots[selected][key] = clamp(n,-150,150); change(); });
flip.addEventListener('change', () => { config.slots[selected].flip = flip.checked; change(); });
$('reset-slot').addEventListener('click', () => { Object.assign(config.slots[selected], {x:0,y:0,scale:1,flip:data.config.slots[selected].flip}); change(); });
stage.querySelectorAll<HTMLElement>('[data-slot]').forEach(slot => {
    let drag: { px: number; py: number; x: number; y: number; width: number; height: number } | null = null;
    slot.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        select(Number(slot.dataset.slot));
        slot.focus({preventScroll:true});
        const box = slot.getBoundingClientRect(), current = config.slots[selected];
        drag = {px:event.clientX,py:event.clientY,x:current.x,y:current.y,width:box.width,height:box.height};
        slot.setPointerCapture(event.pointerId); event.preventDefault();
    });
    slot.addEventListener('pointermove', event => {
        if (!drag) return;
        config.slots[selected].x = clamp(drag.x+(event.clientX-drag.px)/drag.width*100,-150,150);
        config.slots[selected].y = clamp(drag.y+(event.clientY-drag.py)/drag.height*100,-150,150);
        change();
    });
    slot.addEventListener('pointerup', () => {drag=null;});
    slot.addEventListener('pointercancel', () => {drag=null;});
    slot.addEventListener('lostpointercapture', () => {drag=null;});
    slot.addEventListener('wheel', event => {
        event.preventDefault(); select(Number(slot.dataset.slot));
        config.slots[selected].scale = clamp(config.slots[selected].scale + (event.deltaY<0 ? .05 : -.05), .25, 4); change();
    }, {passive:false});
    slot.addEventListener('keydown', event => {
        select(Number(slot.dataset.slot));
        const step = event.shiftKey ? 0.5 : 2;
        const moves:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
        const move=moves[event.key];
        if(move){event.preventDefault();config.slots[selected].x=clamp(config.slots[selected].x+move[0],-150,150);config.slots[selected].y=clamp(config.slots[selected].y+move[1],-150,150);change();}
    });
});
document.querySelectorAll<HTMLInputElement>('input[name=spell]').forEach(radio => radio.addEventListener('change', () => {config.spellVariant=Number(radio.value);change();}));
const dialog=$<HTMLDialogElement>('image-dialog');
document.querySelectorAll<HTMLElement>('[data-enlarge]').forEach(button => button.addEventListener('click',()=>{dialog.querySelector('img')!.src=button.querySelector('img')!.src;dialog.showModal();}));
$('close-dialog').addEventListener('click',()=>dialog.close());
$('save').addEventListener('click', async () => {
    const button=$<HTMLButtonElement>('save'); button.disabled=true; status.textContent='Сохраняю…';
    try {
        const response=await fetch('/__dev/feature-art',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
        const result=await response.json(); if(!response.ok)throw Error(result.error || 'Не удалось сохранить');
        dirty=false; status.textContent='Сохранено. Главная страница использует эту расстановку.';
    } catch(error) { status.textContent=`Ошибка: ${error instanceof Error ? error.message : String(error)}`; }
    finally {button.disabled=false;}
});
$('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='feature-art.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
select(0);
