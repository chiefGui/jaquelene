import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { Breadcrumb } from "./breadcrumb";

describe("Breadcrumb", () => {
  it("identifies the breadcrumb and current page", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumb.Root>
        <Breadcrumb.List>
          <Breadcrumb.Item>Section</Breadcrumb.Item>
          <Breadcrumb.Separator />
          <Breadcrumb.Item>
            <Breadcrumb.Page>Page</Breadcrumb.Page>
          </Breadcrumb.Item>
        </Breadcrumb.List>
      </Breadcrumb.Root>,
    );

    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('role="presentation"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("composes a custom link renderer", () => {
    const markup = renderToStaticMarkup(
      <Breadcrumb.Link render={<a href="/section" />}>Section</Breadcrumb.Link>,
    );

    expect(markup).toContain('href="/section"');
    expect(markup).toContain(">Section</a>");
  });
});
