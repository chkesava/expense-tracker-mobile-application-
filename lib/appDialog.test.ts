import { describe, expect, it, vi } from "vitest";

import {
  mapActionMenuItems,
  mapAlertButtonsToDialogActions,
} from "./appDialog";

describe("mapAlertButtonsToDialogActions", () => {
  it("defaults to a single primary OK action", () => {
    const close = vi.fn();
    const actions = mapAlertButtonsToDialogActions(undefined, close);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ label: "OK", variant: "primary" });
  });

  it("maps cancel + destructive confirm", () => {
    const close = vi.fn();
    const actions = mapAlertButtonsToDialogActions(
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: vi.fn() },
      ],
      close
    );
    expect(actions.map((a) => [a.label, a.variant])).toEqual([
      ["Cancel", "ghost"],
      ["Delete", "destructive"],
    ]);
  });

  it("marks the last non-cancel default as primary", () => {
    const close = vi.fn();
    const actions = mapAlertButtonsToDialogActions(
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Save", style: "default" },
      ],
      close
    );
    expect(actions.map((a) => [a.label, a.variant])).toEqual([
      ["Keep editing", "ghost"],
      ["Save", "primary"],
    ]);
  });

  it("closes immediately when an action is pressed", () => {
    const close = vi.fn();
    const [action] = mapAlertButtonsToDialogActions(
      [{ text: "OK", onPress: vi.fn() }],
      close
    );
    action.onPress();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("mapActionMenuItems", () => {
  it("maps destructive flags for action menus", () => {
    const items = mapActionMenuItems([
      { text: "Buy" },
      { text: "Delete", style: "destructive" },
    ]);
    expect(items[0]).toMatchObject({ label: "Buy", destructive: false });
    expect(items[1]).toMatchObject({ label: "Delete", destructive: true });
  });

  it("invokes the original onPress", () => {
    const onBuy = vi.fn();
    const [buy] = mapActionMenuItems([{ text: "Buy", onPress: onBuy }]);
    buy.onPress();
    expect(onBuy).toHaveBeenCalledOnce();
  });
});
