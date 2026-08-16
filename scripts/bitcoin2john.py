#!/usr/bin/env python3
"""
bitcoin2john.py – Hash Extractor for Bitcoin/Litecoin wallet.dat files.

Extracts the encrypted master key from wallet.dat and outputs a
hashcat-compatible hash string ($bitcoin$ format, mode 11300).

This is a standalone Pure-Python version that does NOT require bsddb3.
It parses the Berkeley DB file at the binary level to find the mkey record.

Based on the original bitcoin2john.py from John the Ripper (Openwall).

Usage:
    python3 bitcoin2john.py <wallet.dat> [--json]

Output (default):
    $bitcoin$96$<encrypted_key>$16$<salt>$<iterations>$2$00$2$00

Output (--json):
    {
        "encrypted_key": "...",
        "salt": "...",
        "iterations": 25000,
        "method": 0,
        "hash": "$bitcoin$96$...",
        "wallet_type": "bitcoin_core",
        "encryption": "AES-256-CBC",
        "kdf": "SHA-512",
        "hashcat_mode": 11300
    }
"""

import binascii
import json
import os
import sqlite3
import struct
import sys


def hexstr(bytestr):
    return binascii.hexlify(bytestr).decode('ascii')


class BCDataStream:
    """Deserializer for Bitcoin's internal serialization format."""

    def __init__(self):
        self.input = None
        self.read_cursor = 0

    def clear(self):
        self.input = None
        self.read_cursor = 0

    def write(self, data):
        if self.input is None:
            self.input = data
        else:
            self.input += data

    def read_string(self):
        length = self.read_compact_size()
        return self.read_bytes(length).decode('ascii')

    def read_bytes(self, length):
        result = self.input[self.read_cursor:self.read_cursor + length]
        self.read_cursor += length
        return result

    def read_uint32(self):
        return self._read_num('<I')

    def read_compact_size(self):
        size = self.input[self.read_cursor]
        if isinstance(size, str):
            size = ord(size)
        self.read_cursor += 1
        if size == 253:
            size = self._read_num('<H')
        elif size == 254:
            size = self._read_num('<I')
        elif size == 255:
            size = self._read_num('<Q')
        return size

    def _read_num(self, fmt):
        (i,) = struct.unpack_from(fmt, self.input, self.read_cursor)
        self.read_cursor += struct.calcsize(fmt)
        return i


def try_sqlite3_wallet(walletfile):
    """Try to open as SQLite3 database (newer Bitcoin Core wallets)."""
    try:
        cx = sqlite3.connect(walletfile)
        cx.execute("PRAGMA quick_check")
        items = list(cx.execute('SELECT key, value FROM main'))
        cx.close()
        return items
    except (sqlite3.DatabaseError, sqlite3.OperationalError):
        return None


def find_mkey_raw(data):
    """
    Find the mkey record by scanning the raw binary data.
    This avoids the need for bsddb3.

    The CMasterKey object contains:
    - Encrypted key (len 32-96 byte, multiple of 16)
    - Salt (8 bytes)
    - nDerivationMethod (0)
    - nDerivationIterations (uint32)
    """
    import re
    results = []

    # AES block size is 16. CMasterKey lengths are typically 48 (\x30) or 80 (\x50).
    # We match the length prefix + exact bytes + salt length \x08 + 8 bytes salt + method 0 + 4 bytes iter.
    pattern = b'(?:\x20.{32}|\x30.{48}|\x40.{64}|\x50.{80}|\x60.{96})\x08(.{8})\x00\x00\x00\x00(.{4})'
    
    for match in re.finditer(pattern, data, re.DOTALL):
        try:
            full_match = match.group(0)
            enc_len = full_match[0]
            encrypted_key = full_match[1:1+enc_len]
            salt = match.group(1)
            iterations = struct.unpack('<I', match.group(2))[0]
            
            # Validate iteration count
            if 100 <= iterations <= 10000000:
                results.append({
                    'encrypted_key': hexstr(encrypted_key),
                    'salt': hexstr(salt),
                    'nDerivationMethod': 0,
                    'nDerivationIterations': iterations,
                })
        except:
            continue

    return results


def parse_bdb_items(data):
    """
    Parse key-value items from raw BDB data by finding mkey records.
    Returns list of (key_bytes, value_bytes) tuples.
    """
    items = []
    results = find_mkey_raw(data)
    for r in results:
        # Reconstruct as fake items for compatibility
        items.append(r)
    return items


def extract_hash(walletfile, output_json=False):
    """
    Extract the hashcat-compatible hash from a wallet file.

    Returns a dict with hash info or None if extraction fails.
    """
    if not os.path.exists(walletfile):
        return {"error": f"File not found: {walletfile}"}

    filesize = os.path.getsize(walletfile)
    if filesize == 0:
        return {"error": "File is empty"}

    # Detect file type
    with open(walletfile, 'rb') as f:
        magic = f.read(16)

    # Check for SQLite
    if magic[:6] == b'SQLite':
        wallet_format = "SQLite"
    # Check for Berkeley DB
    elif magic[0:4] == b'\x00\x05\x31\x62' or magic[12:16] in [b'\x00\x05\x31\x62', b'\x62\x31\x05\x00']:
        wallet_format = "Berkeley DB"
    else:
        # Try to detect by scanning for mkey pattern
        with open(walletfile, 'rb') as f:
            content = f.read(min(filesize, 10 * 1024 * 1024))  # max 10MB
        if b'\x04mkey' in content:
            wallet_format = "Berkeley DB (headerless)"
        else:
            return {"error": "Unknown file format. Not a recognized wallet.dat file."}

    mkey_data = None

    # Try SQLite first
    if wallet_format == "SQLite":
        items = try_sqlite3_wallet(walletfile)
        if items:
            kds = BCDataStream()
            vds = BCDataStream()
            for (key, value) in items:
                kds.clear()
                kds.write(key)
                vds.clear()
                vds.write(value)
                try:
                    type_str = kds.read_string()
                    if type_str == "mkey":
                        encrypted_key = vds.read_bytes(vds.read_compact_size())
                        salt = vds.read_bytes(vds.read_compact_size())
                        method = vds.read_uint32()
                        iterations = vds.read_uint32()
                        mkey_data = {
                            'encrypted_key': hexstr(encrypted_key),
                            'salt': hexstr(salt),
                            'nDerivationMethod': method,
                            'nDerivationIterations': iterations,
                        }
                        break
                except Exception:
                    continue

    # Try raw binary parsing (for BDB files or if SQLite failed)
    if mkey_data is None:
        with open(walletfile, 'rb') as f:
            raw_data = f.read()
        results = find_mkey_raw(raw_data)
        if results:
            mkey_data = results[0]

    if mkey_data is None:
        return {"error": "No encrypted master key found. The wallet may not be encrypted."}

    # Validate and build hash
    cry_master = mkey_data['encrypted_key']
    cry_salt = mkey_data['salt']
    cry_rounds = mkey_data['nDerivationIterations']
    cry_method = mkey_data['nDerivationMethod']

    if cry_method != 0:
        return {"error": f"Unknown key derivation method: {cry_method}"}

    # Use last 64 hex chars (32 bytes = 2 AES blocks) for the hash
    if len(cry_master) >= 64:
        cry_master_trimmed = cry_master[-64:]
    else:
        cry_master_trimmed = cry_master

    salt_len = len(cry_salt)
    master_len = len(cry_master_trimmed)

    # Build hashcat-compatible hash string
    hash_string = f"$bitcoin${master_len}${cry_master_trimmed}${salt_len}${cry_salt}${cry_rounds}$2$00$2$00"

    result = {
        "encrypted_key": cry_master,
        "encrypted_key_trimmed": cry_master_trimmed,
        "salt": cry_salt,
        "iterations": cry_rounds,
        "method": cry_method,
        "hash": hash_string,
        "wallet_type": "bitcoin_core",
        "wallet_format": wallet_format,
        "encryption": "AES-256-CBC",
        "kdf": f"SHA-512 × {cry_rounds}",
        "hashcat_mode": 11300,
        "file_size": filesize,
    }

    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} <wallet.dat> [--json]\n")
        sys.exit(1)

    walletfile = sys.argv[1]
    output_json = '--json' in sys.argv

    result = extract_hash(walletfile, output_json)

    if 'error' in result:
        sys.stderr.write(f"Error: {result['error']}\n")
        sys.exit(1)

    if output_json:
        print(json.dumps(result, indent=2))
    else:
        print(result['hash'])
