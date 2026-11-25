#!/usr/bin/env python3
"""Elenco ufficiale italiano dei prestatori di servizi fiduciari (Trusted List AgID, ETSI TS 119 612): estrae i
certificati dei certificatori qualificati (CA/QC) e delle marche temporali qualificate (TSA/QTST), con la storia dello
stato di ciascun servizio. Scrive src/tsl-it.json (incorporato nell'app dalla build: la verifica resta sul dispositivo).
Uso: python3 tools/tsl.py [file TSL-IT.xml]   (senza argomento lo scarica da eidas.agid.gov.it)"""
import json, sys, pathlib, urllib.request, xml.etree.ElementTree as ET
URL = 'https://eidas.agid.gov.it/TL/TSL-IT.xml'
NS = {'t': 'http://uri.etsi.org/02231/v2#'}
raw = open(sys.argv[1], 'rb').read() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=60).read()
r = ET.fromstring(raw)
issued = r.find('.//t:ListIssueDateTime', NS).text; nxt = r.find('.//t:NextUpdate/t:dateTime', NS).text
KEEP = {'http://uri.etsi.org/TrstSvc/Svctype/CA/QC': 'QC', 'http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST': 'TSA'}
out, seen = [], set()
for tsp in r.findall('.//t:TrustServiceProvider', NS):
    name = tsp.find('./t:TSPInformation/t:TSPName/t:Name', NS).text.strip()
    for svc in tsp.findall('./t:TSPServices/t:TSPService', NS):
        si = svc.find('./t:ServiceInformation', NS); ty = KEEP.get(si.find('t:ServiceTypeIdentifier', NS).text)
        if not ty: continue
        st = lambda e: e.find('t:ServiceStatus', NS).text.rsplit('/', 1)[-1]
        hist = [[st(si), si.find('t:StatusStartingTime', NS).text]] + [[st(h), h.find('t:StatusStartingTime', NS).text] for h in svc.findall('./t:ServiceHistory/t:ServiceHistoryInstance', NS)]
        hist.sort(key=lambda x: x[1])
        for c in si.findall('./t:ServiceDigitalIdentity/t:DigitalId/t:X509Certificate', NS):
            b = ''.join(c.text.split())
            if (b, ty) in seen: continue
            seen.add((b, ty)); out.append({'n': name, 't': ty, 'c': b, 'h': hist})
dst = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'tsl-it.json'
dst.write_text(json.dumps({'fonte': URL, 'emesso': issued, 'prossimo': nxt, 'servizi': out}, separators=(',', ':')), encoding='utf-8')
print(f'{dst}: {len(out)} certificati ({sum(1 for o in out if o["t"] == "QC")} certificatori, {sum(1 for o in out if o["t"] == "TSA")} marche temporali), {dst.stat().st_size // 1024} KB, emesso {issued}')
