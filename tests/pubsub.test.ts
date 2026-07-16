import { describe, expect, it, vi } from "vitest";
import { MemoryBus } from "@/lib/pubsub";

describe("MemoryBus", () => {
  it("delivers events to subscribers of the channel", async () => {
    const bus = new MemoryBus();
    const fn = vi.fn();
    bus.subscribe("session:1", fn);
    await bus.publish("session:1", { type: "message.created" });
    expect(fn).toHaveBeenCalledWith("session:1", { type: "message.created" });
  });

  it("does not deliver to other channels", async () => {
    const bus = new MemoryBus();
    const fn = vi.fn();
    bus.subscribe("session:1", fn);
    await bus.publish("session:2", { type: "message.created" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers per channel", async () => {
    const bus = new MemoryBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("admin", a);
    bus.subscribe("admin", b);
    await bus.publish("admin", { type: "x" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("stops delivering after unsubscribe", async () => {
    const bus = new MemoryBus();
    const fn = vi.fn();
    const unsub = bus.subscribe("admin", fn);
    unsub();
    await bus.publish("admin", { type: "x" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("isolates a throwing subscriber from the others", async () => {
    const bus = new MemoryBus();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    bus.subscribe("admin", bad);
    bus.subscribe("admin", good);
    await bus.publish("admin", { type: "x" });
    expect(good).toHaveBeenCalledOnce();
  });
});
