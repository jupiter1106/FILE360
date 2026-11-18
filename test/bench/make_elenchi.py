#!/usr/bin/env python3
"""Documento inventato con elenchi (puntati, numerati, annidati, che continuano sulla pagina dopo, che ripartono)
per il banco «PDF in Word · elenchi veri». → test/bench/tools/elenchi.pdf"""
import pathlib
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
D = pathlib.Path(__file__).parent / 'tools'; W, H = A4
c = canvas.Canvas(str(D / 'elenchi.pdf'), pagesize=A4)
L = 70; y = H - 80
def text(t, x, f='Helvetica', s=11):
    global y
    c.setFont(f, s); c.drawString(x, y, t); y -= s * 1.35
def item(mark, lines, mx, tx):
    global y
    c.setFont('Helvetica', 11); c.drawString(mx, y, mark)
    for k, t in enumerate(lines): c.drawString(tx, y, t); y -= 11 * 1.35
    y -= 3
text('Regolamento della biblioteca di quartiere', L, 'Helvetica-Bold', 15); y -= 6
text('Il presente regolamento descrive i servizi offerti e le regole da rispettare negli spazi comuni.', L)
text('Chi frequenta la sala lettura si impegna a seguire le indicazioni riportate di seguito.', L); y -= 6
item('•', ['Il prestito dura trenta giorni ed è rinnovabile una sola volta.'], L + 10, L + 28)
item('•', ['I libri vanno restituiti al banco, non lasciati sui tavoli della sala lettura o negli', 'scaffali, perché il personale possa registrarne subito il rientro.'], L + 10, L + 28)
item('•', ['Le riviste si consultano soltanto in sede.'], L + 10, L + 28)
y -= 6; text('Per iscriversi occorre seguire questi passaggi:', L); y -= 4
item('1.', ['Compilare il modulo di iscrizione disponibile al banco.'], L + 10, L + 30)
item('2.', ['Presentare un documento di identità valido, scegliendo tra:'], L + 10, L + 30)
item('a)', ['carta di identità;'], L + 30, L + 48)
item('b)', ['passaporto.'], L + 30, L + 48)
item('3.', ['Ritirare la tessera personale, che vale tre anni.'], L + 10, L + 30)
c.showPage(); y = H - 80
item('4.', ['Firmare il regolamento per accettazione.'], L + 10, L + 30)
item('5.', ['Lasciare un recapito per gli avvisi di scadenza.'], L + 10, L + 30)
y -= 8; text('Orari di apertura straordinaria:', L); y -= 4
item('1)', ['sabato mattina nel periodo degli esami;'], L + 10, L + 30)
item('2)', ['domenica pomeriggio durante la fiera del libro.'], L + 10, L + 30)
y -= 8; text('Sono vietati:', L); y -= 4
item('–', ['cibo e bevande nella sala lettura;'], L + 10, L + 28)
item('–', ['telefonate ad alta voce.'], L + 10, L + 28)
c.showPage(); c.save()
