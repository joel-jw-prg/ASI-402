param(
    [Parameter(Mandatory = $true)][string]$Stl,
    [Parameter(Mandatory = $true)][string]$OutJs
)
# Converts a binary STL into a compact, indexed, int16-quantised mesh wrapped in a JS file
# (base64) so the site can load it with a <script> tag, even when opened from file://.
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Globalization;

public static class StlPack
{
    class Chunk
    {
        public Dictionary<long, int> Map = new Dictionary<long, int>();
        public List<short> Pos = new List<short>();
        public List<ushort> Idx = new List<ushort>();
        public int VCount { get { return Pos.Count / 3; } }
    }

    static long Key(int x, int y, int z)
    {
        ulong a = (ulong)(ushort)x, b = (ulong)(ushort)y, c = (ulong)(ushort)z;
        return (long)((a << 32) | (b << 16) | c);
    }

    public static string Run(string stlPath, string outJs)
    {
        byte[] data = File.ReadAllBytes(stlPath);
        int n = (int)BitConverter.ToUInt32(data, 80);
        if (84 + 50L * n != data.Length) throw new Exception("Not a binary STL of the expected size");

        float[] v = new float[n * 9];
        float minX = float.MaxValue, minY = float.MaxValue, minZ = float.MaxValue;
        float maxX = float.MinValue, maxY = float.MinValue, maxZ = float.MinValue;
        int off = 84;
        for (int t = 0; t < n; t++)
        {
            int p = off + 12; // skip the stored normal
            for (int k = 0; k < 9; k++) v[t * 9 + k] = BitConverter.ToSingle(data, p + 4 * k);
            for (int k = 0; k < 3; k++)
            {
                float x = v[t * 9 + k * 3], y = v[t * 9 + k * 3 + 1], z = v[t * 9 + k * 3 + 2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            off += 50;
        }
        float ext = Math.Max(maxX - minX, Math.Max(maxY - minY, maxZ - minZ));
        double scale = 65535.0 / ext; // quantisation steps per mm

        List<Chunk> chunks = new List<Chunk>();
        Chunk cur = new Chunk();
        chunks.Add(cur);
        int[] q = new int[9];
        long[] keys = new long[3];
        int kept = 0, degenerate = 0;
        for (int t = 0; t < n; t++)
        {
            for (int k = 0; k < 3; k++)
            {
                q[k * 3] = (int)Math.Round((v[t * 9 + k * 3] - minX) * scale) - 32768;
                q[k * 3 + 1] = (int)Math.Round((v[t * 9 + k * 3 + 1] - minY) * scale) - 32768;
                q[k * 3 + 2] = (int)Math.Round((v[t * 9 + k * 3 + 2] - minZ) * scale) - 32768;
                keys[k] = Key(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]);
            }
            if (keys[0] == keys[1] || keys[1] == keys[2] || keys[0] == keys[2]) { degenerate++; continue; }
            int need = 0;
            for (int k = 0; k < 3; k++) if (!cur.Map.ContainsKey(keys[k])) need++;
            if (cur.VCount + need > 65535)
            {
                cur = new Chunk();
                chunks.Add(cur);
            }
            for (int k = 0; k < 3; k++)
            {
                int idx;
                if (!cur.Map.TryGetValue(keys[k], out idx))
                {
                    idx = cur.VCount;
                    cur.Map[keys[k]] = idx;
                    cur.Pos.Add((short)q[k * 3]); cur.Pos.Add((short)q[k * 3 + 1]); cur.Pos.Add((short)q[k * 3 + 2]);
                }
                cur.Idx.Add((ushort)idx);
            }
            kept++;
        }

        MemoryStream ms = new MemoryStream();
        BinaryWriter bw = new BinaryWriter(ms);
        StringBuilder meta = new StringBuilder();
        int totalV = 0;
        for (int c = 0; c < chunks.Count; c++)
        {
            Chunk ch = chunks[c];
            foreach (short s in ch.Pos) bw.Write(s);
            foreach (ushort u in ch.Idx) bw.Write(u);
            if (c > 0) meta.Append(",");
            meta.Append("{v:" + ch.VCount + ",i:" + ch.Idx.Count + "}");
            totalV += ch.VCount;
        }
        bw.Flush();
        byte[] bin = ms.ToArray();
        CultureInfo ci = CultureInfo.InvariantCulture;
        StringBuilder js = new StringBuilder();
        js.Append("/* Tarot TL680A reference frame mesh - generated from Tarot_TL680A_reference_assembly.stl.\n");
        js.Append("   Indexed, int16-quantised positions (little-endian); units are millimetres, Z is up. */\n");
        js.Append("window.FRAME_MODEL={units:'mm',");
        js.Append("min:[" + minX.ToString("R", ci) + "," + minY.ToString("R", ci) + "," + minZ.ToString("R", ci) + "],");
        js.Append("max:[" + maxX.ToString("R", ci) + "," + maxY.ToString("R", ci) + "," + maxZ.ToString("R", ci) + "],");
        js.Append("scale:" + scale.ToString("R", ci) + ",");
        js.Append("triangles:" + kept + ",vertices:" + totalV + ",");
        js.Append("chunks:[" + meta.ToString() + "],");
        js.Append("b64:\"");
        js.Append(Convert.ToBase64String(bin));
        js.Append("\"};\n");
        File.WriteAllText(outJs, js.ToString(), new UTF8Encoding(false));

        return "triangles in=" + n + " kept=" + kept + " degenerate=" + degenerate + " vertices=" + totalV +
               " chunks=" + chunks.Count + " binary=" + bin.Length + " bytes; bbox=(" +
               minX.ToString("F2", ci) + "," + minY.ToString("F2", ci) + "," + minZ.ToString("F2", ci) + ")-(" +
               maxX.ToString("F2", ci) + "," + maxY.ToString("F2", ci) + "," + maxZ.ToString("F2", ci) + ")";
    }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
[StlPack]::Run($Stl, $OutJs)
"{0}  {1:N0} bytes" -f $OutJs, (Get-Item $OutJs).Length
