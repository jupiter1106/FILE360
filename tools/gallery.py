import os,glob
from PIL import Image
G='consegna/galleria'; os.makedirs(G+'/img',exist_ok=True)
pairs=[]
def add(title,name):
    a,b=f'shots/prima/{name}.png',f'shots/dopo/{name}.png'
    if not (os.path.exists(a) and os.path.exists(b)): return
    out=[]
    for tag,src in (('prima',a),('dopo',b)):
        im=Image.open(src).convert('RGB'); k=min(1,720/im.width); 
        if im.height*k>1300: im=im.crop((0,0,im.width,int(1300/k)))
        im=im.resize((int(im.width*k),int(im.height*k)),Image.LANCZOS); fn=f'{name}-{tag}.jpg'; im.save(f'{G}/img/{fn}',quality=82); out.append(fn)
    pairs.append((title,out,im.width<500))
V=[('desk1440','Desktop 1440×900'),('desk1280','Desktop 1280×720'),('ipad','iPad'),('iphoneSE','iPhone SE'),('iphone13','iPhone 13'),('android','Android (Pixel 5)')]
for v,l in V:
    add(f'Home · {l} · chiaro',f'home-{v}-light'); add(f'Home · {l} · scuro',f'home-{v}-dark')
for v,l in V: add(f'Strumento vuoto (Comprimi) · {l}',f'tool-comprimi-{v}-light')
for t,l in [('comprimi','Comprimi'),('modifica','Modifica'),('oscura','Oscura'),('ocr','OCR'),('moduli','Compila'),('fatture','Fatture'),('firme','Firme e P7M'),('unisci','Unisci'),('migliora','Migliora')]:
    for v,vl in (('desk1440','desktop'),('iphone13','telefono')): add(f'{l} con il file · {vl}',f'ws-{t}-{v}')
for v,vl in (('desk1440','desktop'),('iphone13','telefono')):
    add(f'Attesa · {vl}',f'busy-comprimi-{v}')
    for t,l in [('comprimi','Comprimi'),('firme','P7M'),('dividi','Dividi'),('word','Word')]: add(f'Risultato {l} · {vl}',f'res-{t}-{v}')
    for e,l in [('rotto','File rotto'),('protetto','File protetto'),('sbagliato','Formato sbagliato')]: add(f'Errore: {l} · {vl}',f'err-{e}-{v}')
for pg in ['progetti','ricette','attivita']:
    for sc in ['light','dark']: add(f'{pg.capitalize()} · {sc}',f'page-{pg}-desk1440-{sc}')
for sc in ['light','dark']: add(f'Ricerca · {sc}',f'cmd-desk1440-{sc}'); add(f'Home di chi torna · {sc}',f'home-ritorno-desk1440-{sc}')
html=['''<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galleria prima e dopo</title>
<style>:root{--bg:#f8f5f1;--ink:#17181c;--mu:#5e6067;--ln:#e1ded7;--sf:#fff}@media (prefers-color-scheme:dark){:root{--bg:#0d0e11;--ink:#eeedea;--mu:#9c9ea5;--ln:#2c2e32;--sf:#16171a}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}p{color:var(--mu);margin:0 0 24px}
section{margin:0 0 28px;padding:16px;background:var(--sf);border:1px solid var(--ln);border-radius:14px}h2{font-size:15px;margin:0 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.pair.n{max-width:760px}
figure{margin:0}figcaption{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);margin-bottom:6px}img{width:100%;height:auto;border:1px solid var(--ln);border-radius:8px;display:block}
video{width:100%;border:1px solid var(--ln);border-radius:8px}@media (max-width:640px){.pair{grid-template-columns:1fr}}</style><main>
<h1>Galleria prima e dopo</h1><p>Stessi stati, stessi file di prova (sintetici), stessa finestra. A sinistra la build ricevuta, a destra quella consegnata.</p>
<section><h2>Registrazioni: dalla home al file compresso</h2><div class="pair"><figure><figcaption>Prima · desktop</figcaption><video controls muted src="video/prima-desktop.webm"></video></figure><figure><figcaption>Dopo · desktop</figcaption><video controls muted src="video/dopo-desktop.webm"></video></figure></div>
<div class="pair n" style="margin-top:16px"><figure><figcaption>Prima · telefono</figcaption><video controls muted src="video/prima-telefono.webm"></video></figure><figure><figcaption>Dopo · telefono</figcaption><video controls muted src="video/dopo-telefono.webm"></video></figure></div></section>''']
for t,(a,b),narrow in pairs: html.append(f'<section><h2>{t}</h2><div class="pair{" n" if narrow else ""}"><figure><figcaption>Prima</figcaption><img loading="lazy" src="img/{a}" alt="{t}, prima"></figure><figure><figcaption>Dopo</figcaption><img loading="lazy" src="img/{b}" alt="{t}, dopo"></figure></div></section>')
# funzioni aggiunte su richiesta: non c'è un «prima», solo il «dopo»
NEW=[('Miniature con la lente «Ingrandisci»','new-lenti'),('Anteprima grande: frecce, zoom, scorrimento','new-anteprima'),('Migliora › Ritaglio a mano: angoli, lati e lente','new-ritaglio'),('Ricette: trascina i file sopra la ricetta','new-ricette')]
html.append('<section><h2>Novità chieste durante il lavoro</h2><p style="margin:0 0 12px">Funzioni nuove: non c’è un «prima» da confrontare.</p>')
for t,n in NEW:
    figs=[]
    for v,vl in (('desk1440','computer'),('iphone13','telefono')):
        src=f'shots/dopo/{n}-{v}.png'
        if not os.path.exists(src): continue
        im=Image.open(src).convert('RGB'); k=min(1,720/im.width)
        if im.height*k>1300: im=im.crop((0,0,im.width,int(1300/k)))
        im=im.resize((int(im.width*k),int(im.height*k)),Image.LANCZOS); fn=f'{n}-{v}.jpg'; im.save(f'{G}/img/{fn}',quality=82)
        figs.append(f'<figure><figcaption>{vl}</figcaption><img loading="lazy" src="img/{fn}" alt="{t}, {vl}"></figure>')
    html.append(f'<h2 style="margin-top:16px">{t}</h2><div class="pair">'+''.join(figs)+'</div>')
html.append('</section>')
html.append('</main></html>'); open(G+'/index.html','w',encoding='utf-8').write('\n'.join(html)); print(len(pairs),'coppie')
