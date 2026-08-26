import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { Item } from "./item";

describe("Item", () => {
  it("composes a custom item renderer", () => {
    const markup = renderToStaticMarkup(
      <Item.Root render={<a href="/details" />}>
        <Item.Content>
          <Item.Title>Details</Item.Title>
          <Item.Description>Supporting information</Item.Description>
        </Item.Content>
        <Item.Meta>12 MB</Item.Meta>
      </Item.Root>,
    );

    expect(markup).toContain('<a href="/details"');
    expect(markup).toContain("Details");
    expect(markup).toContain("Supporting information");
    expect(markup).toContain("12 MB");
  });
});
