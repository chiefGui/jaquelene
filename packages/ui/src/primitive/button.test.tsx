import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { Button } from "./button";

describe("Button", () => {
  it("renders a native non-submit button by default", () => {
    const markup = renderToStaticMarkup(<Button>Save</Button>);

    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain(">Save</button>");
  });

  it("preserves explicit submit behavior", () => {
    const markup = renderToStaticMarkup(<Button type="submit">Create</Button>);

    expect(markup).toContain('type="submit"');
  });
});
