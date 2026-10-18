"""Servidor estático de desenvolvimento, sem cache.

Igual a `python -m http.server`, mas manda `Cache-Control: no-store` para o
navegador sempre baixar a versão atual dos arquivos. Sem isso o Chrome do
celular reaproveita o .js antigo — e as páginas não têm "puxar para recarregar".

Uso: python dev-server.py [porta]   (padrão: 3004)
"""

import functools
import http.server
import pathlib
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 3004
root = pathlib.Path(__file__).parent
handler = functools.partial(NoCacheHandler, directory=root)
print(f'Servindo {root} em http://localhost:{port} (sem cache)')
http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
