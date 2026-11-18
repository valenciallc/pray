package com.valenciallc.pray;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;

/** خادم HTTP داخلي يقدّم ملفات التطبيق من filesDir/www على 127.0.0.1 فقط. */
final class LocalWebServer {
    private final File root;
    private ServerSocket server;
    private volatile boolean running;

    LocalWebServer(File root) {
        this.root = root;
    }

    int start() throws IOException {
        server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        running = true;
        Thread t = new Thread(this::loop, "pray-http");
        t.setDaemon(true);
        t.start();
        return server.getLocalPort();
    }

    void stop() {
        running = false;
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
            }
        }
    }

    private void loop() {
        while (running) {
            try {
                Socket client = server.accept();
                Thread t = new Thread(() -> handle(client), "pray-http-req");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket socket) {
        try (Socket s = socket;
             BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.ISO_8859_1));
             OutputStream out = s.getOutputStream()) {
            String line = in.readLine();
            if (line == null || line.isEmpty()) return;
            String[] parts = line.split(" ");
            if (parts.length < 2) return;
            String target = parts[1];
            String range = null;
            String h;
            while ((h = in.readLine()) != null && !h.isEmpty()) {
                if (h.toLowerCase(Locale.ROOT).startsWith("range:")) range = h.substring(6).trim();
            }
            int q = target.indexOf('?');
            String path = q >= 0 ? target.substring(0, q) : target;
            try {
                path = URLDecoder.decode(path, "UTF-8");
            } catch (Exception ignored) {
            }
            if (path.isEmpty() || "/".equals(path)) path = "/index.html";

            File base = root.getCanonicalFile();
            File file = new File(base, path.startsWith("/") ? path.substring(1) : path).getCanonicalFile();
            if (!file.getAbsolutePath().startsWith(base.getAbsolutePath() + File.separator)) {
                send(out, 403, null, null, -1, -1);
                return;
            }
            if (!file.isFile()) {
                send(out, 404, null, null, -1, -1);
                return;
            }

            byte[] data = readAll(file);
            long from = 0, to = data.length - 1;
            boolean partial = false;
            if (range != null && range.toLowerCase(Locale.ROOT).startsWith("bytes=")) {
                String spec = range.substring(6).trim();
                int dash = spec.indexOf('-');
                try {
                    if (dash > 0) {
                        from = Long.parseLong(spec.substring(0, dash));
                        if (spec.length() > dash + 1) to = Long.parseLong(spec.substring(dash + 1));
                        if (from >= 0 && from <= to && from < data.length) partial = true;
                    } else if (dash == 0 && spec.length() > 1) {
                        long suffix = Long.parseLong(spec.substring(1));
                        from = Math.max(0, data.length - suffix);
                        partial = true;
                    }
                } catch (NumberFormatException ignored) {
                    partial = false;
                }
                if (to >= data.length) to = data.length - 1;
            }
            if (partial) {
                byte[] piece = Arrays.copyOfRange(data, (int) from, (int) to + 1);
                send(out, 206, mime(file.getName()), piece, from, data.length);
            } else {
                send(out, 200, mime(file.getName()), data, -1, -1);
            }
        } catch (Exception ignored) {
        }
    }

    private static void send(OutputStream out, int status, String type, byte[] body, long from, long total) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 ");
        switch (status) {
            case 200: head.append("200 OK"); break;
            case 206: head.append("206 Partial Content"); break;
            case 403: head.append("403 Forbidden"); break;
            default: head.append("404 Not Found");
        }
        head.append("\r\nContent-Type: ").append(type == null ? "application/octet-stream" : type);
        head.append("\r\nContent-Length: ").append(body == null ? 0 : body.length);
        head.append("\r\nCache-Control: no-store");
        head.append("\r\nX-Content-Type-Options: nosniff");
        head.append("\r\nAccept-Ranges: bytes");
        if (status == 206 && from >= 0 && total >= 0 && body != null) {
            head.append("\r\nContent-Range: bytes ").append(from).append('-')
                    .append(from + body.length - 1).append('/').append(total);
        }
        head.append("\r\nConnection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.US_ASCII));
        if (body != null && body.length > 0) out.write(body);
        out.flush();
    }

    private static String mime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }
}
