#!/usr/bin/env python3
"""File firmati (tutto inventato) con le informazioni di revoca incluse, per il banco «firme · revoca»:
- revoca-ocsp.pdf.p7m: firma CAdES, risposta OCSP «good» tra gli attributi non firmati (revocation-values, CAdES-XL);
- revoca-revocata.pdf.p7m: firma CAdES di un certificato revocato prima della firma, CRL nella busta (SignedData.crls);
- revoca-pades.pdf: firma PAdES con la risposta OCSP nel DSS del PDF (PAdES-LTV).
Uso: python3 test/bench/make_revoca.py  (servono openssl, asn1crypto, pyhanko)"""
import subprocess, tempfile, pathlib
from asn1crypto import cms, core, ocsp as aocsp, crl as acrl
D = pathlib.Path(__file__).parent / 'tools'
PADES = """
import sys, subprocess, pathlib
from pyhanko.sign import signers
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.validation.dss import DocumentSecurityStore
from asn1crypto import x509 as ax, ocsp as aocsp
T = pathlib.Path(sys.argv[1]); out = sys.argv[2]
sgn = signers.SimpleSigner.load(str(T / 'valido.key'), str(T / 'valido.pem'), ca_chain_files=(str(T / 'ca.pem'),))
with open(T / 'doc.pdf', 'rb') as f:
    w = IncrementalPdfFileWriter(f)
    with open(T / 'pades.pdf', 'wb') as o: signers.PdfSigner(signers.PdfSignatureMetadata(field_name='Firma1'), signer=sgn).sign_pdf(w, output=o)
ca = ax.Certificate.load(subprocess.run(['openssl', 'x509', '-in', str(T / 'ca.pem'), '-outform', 'DER'], capture_output=True).stdout)
resp = aocsp.OCSPResponse.load((T / 'resp.der').read_bytes())
import shutil; shutil.copy(T / 'pades.pdf', out)
with open(out, 'r+b') as f: DocumentSecurityStore.add_dss(f, sig_contents=None, certs=[ca], ocsps=[resp])
"""
def sh(*a, cwd=None): subprocess.run(a, check=True, capture_output=True, cwd=cwd)
with tempfile.TemporaryDirectory() as td:
    T = pathlib.Path(td)
    (T / 'ca.cnf').write_text("""[ca]\ndefault_ca=c\n[c]\ndir=.\ndatabase=index.txt\nnew_certs_dir=.\nserial=serial\ncrlnumber=crlnumber\ndefault_md=sha256\npolicy=p\ndefault_days=800\ndefault_crl_days=30\ncopy_extensions=copy\n[p]\ncommonName=supplied\n[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=CA DI PROVA REVOCHE\nO=Ente Inventato\nC=IT\n[v3ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n[usr]\nbasicConstraints=CA:FALSE\nkeyUsage=critical,nonRepudiation,digitalSignature\nauthorityInfoAccess=OCSP;URI:http://ocsp.esempio.invalid\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n""")
    (T / 'index.txt').write_text(''); (T / 'serial').write_text('1000\n'); (T / 'crlnumber').write_text('01\n')
    sh('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '1500', '-config', 'ca.cnf', '-extensions', 'v3ca', '-set_serial', '1', cwd=T)
    for who in ('valido', 'revocato'):
        sh('openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f'{who}.key', '-out', f'{who}.csr', '-subj', f'/CN=FIRMATARIO {who.upper()} (PROVA)/C=IT', cwd=T)
        sh('openssl', 'ca', '-batch', '-config', 'ca.cnf', '-in', f'{who}.csr', '-out', f'{who}.pem', '-extensions', 'usr', '-cert', 'ca.pem', '-keyfile', 'ca.key', '-startdate', '20250101000000Z', cwd=T)
    # revocato ieri; firma di oggi: era già revocato al momento della firma
    sh('openssl', 'ca', '-batch', '-config', 'ca.cnf', '-revoke', 'revocato.pem', '-cert', 'ca.pem', '-keyfile', 'ca.key', '-crl_reason', 'keyCompromise', cwd=T)
    sh('openssl', 'ca', '-batch', '-config', 'ca.cnf', '-gencrl', '-out', 'ca.crl', '-cert', 'ca.pem', '-keyfile', 'ca.key', cwd=T)
    sh('openssl', 'crl', '-in', 'ca.crl', '-outform', 'DER', '-out', 'ca.crl.der', cwd=T)
    sh('openssl', 'ocsp', '-issuer', 'ca.pem', '-cert', 'valido.pem', '-reqout', 'req.der', '-no_nonce', cwd=T)
    sh('openssl', 'ocsp', '-index', 'index.txt', '-rsigner', 'ca.pem', '-rkey', 'ca.key', '-CA', 'ca.pem', '-reqin', 'req.der', '-respout', 'resp.der', '-ndays', '7', cwd=T)
    doc = T / 'doc.pdf'
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(doc)); c.drawString(70, 760, 'Determina di prova: documento firmato per le prove sulla revoca.'); c.save()
    for who in ('valido', 'revocato'):
        sh('openssl', 'cms', '-sign', '-binary', '-nodetach', '-in', 'doc.pdf', '-signer', f'{who}.pem', '-inkey', f'{who}.key', '-certfile', 'ca.pem', '-outform', 'DER', '-out', f'{who}.p7m', '-md', 'sha256', cwd=T)
    ci = cms.ContentInfo.load((T / 'valido.p7m').read_bytes()); sd = ci['content']
    resp = aocsp.OCSPResponse.load((T / 'resp.der').read_bytes())
    basic = resp['response_bytes']['response'].parsed
    # RevocationValues ::= SEQUENCE { crlVals [0] SEQUENCE OF CertificateList OPTIONAL, ocspVals [1] SEQUENCE OF BasicOCSPResponse OPTIONAL }
    class OcspVals(core.SequenceOf): _child_spec = aocsp.BasicOCSPResponse
    class RevVals(core.Sequence): _fields = [('ocsp_vals', OcspVals, {'explicit': 1, 'optional': True})]
    val = RevVals({'ocsp_vals': [basic]})
    si = sd['signer_infos'][0]
    # attributo non firmato costruito a mano (DER): SEQUENCE { OID, SET { RevocationValues } }
    def der(tag, body):
        n = len(body)
        L = bytes([n]) if n < 128 else (lambda b: bytes([0x80 | len(b)]) + b)(n.to_bytes((n.bit_length() + 7) // 8, 'big'))
        return bytes([tag]) + L + body
    attr_der = der(0x30, core.ObjectIdentifier('1.2.840.113549.1.9.16.2.24').dump() + der(0x31, val.dump()))
    si['unsigned_attrs'] = cms.CMSAttributes.load(der(0x31, attr_der))
    (D / 'revoca-ocsp.pdf.p7m').write_bytes(ci.dump(force=True))
    ci2 = cms.ContentInfo.load((T / 'revocato.p7m').read_bytes())
    ci2['content']['crls'] = cms.RevocationInfoChoices([cms.RevocationInfoChoice(name='crl', value=acrl.CertificateList.load((T / 'ca.crl.der').read_bytes()))])
    (D / 'revoca-revocata.pdf.p7m').write_bytes(ci2.dump(force=True))
    # PAdES con DSS (OCSP) aggiunto dopo la firma (pyhanko in un processo a sé: registra i suoi tipi in asn1crypto)
    r = subprocess.run(['python3', '-c', PADES, str(T), str(D / 'revoca-pades.pdf')], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-1500:])
print('ok', sorted(p.name for p in D.glob('revoca-*')))
