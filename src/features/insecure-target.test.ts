import { describe, expect, it } from "vitest";
import { classifyTarget, isLoopbackHost, portProxyCommand } from "./insecure-target";

describe("insecure target detection", () => {
  it("never flags anything when the page itself is http", () => {
    expect(classifyTarget("http://192.168.1.10:8002", "http:")).toBe("ok");
    expect(classifyTarget("http://127.0.0.1:8002", "http:")).toBe("ok");
  });

  it("does not flag https targets from an https page", () => {
    expect(classifyTarget("https://lab.example.com", "https:")).toBe("ok");
  });

  it.each(["http://127.0.0.1:8002", "http://localhost:8002", "http://[::1]:8002", "http://127.1.2.3:80"])(
    "treats %s as loopback (allowed by most browsers)",
    (url) => {
      expect(classifyTarget(url, "https:")).toBe("loopback");
    },
  );

  it.each(["http://192.168.1.10:8002", "http://10.0.0.5:8002", "http://host-pc:8002"])(
    "flags %s as blocked mixed content",
    (url) => {
      expect(classifyTarget(url, "https:")).toBe("blocked");
    },
  );

  it("tolerates unparsable input", () => {
    expect(classifyTarget("not a url", "https:")).toBe("ok");
    expect(portProxyCommand("not a url")).toBe("");
  });

  it("recognises loopback hostnames", () => {
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("app.localhost")).toBe(true);
    expect(isLoopbackHost("192.168.1.1")).toBe(false);
  });

  it("builds a portproxy command that forwards the same port", () => {
    expect(portProxyCommand("http://192.168.1.10:8002")).toBe(
      "netsh interface portproxy add v4tov4 listenport=8002 listenaddress=127.0.0.1 connectport=8002 connectaddress=192.168.1.10",
    );
  });
});
