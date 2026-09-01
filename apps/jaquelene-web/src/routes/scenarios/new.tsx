import {
  Form as AriakitForm,
  FormDescription,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  SCENARIO_TITLE_MAX_LENGTH,
  SCENARIO_TITLE_MAX_UTF16_LENGTH,
  createScenarioInputSchema,
  type CreateScenarioInput,
} from "@jaquelene/domain";
import { Button, Field, Form as FormLayout, Input } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useCreateScenarioFormValidation } from "@/feature/scenario/form";
import type { Scenario } from "@/feature/scenario/ipc";
import { useCreateScenario } from "@/feature/scenario/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/scenarios/new")({
  component: NewScenarioRoute,
});

function NewScenarioRoute() {
  const createScenarioMutation = useCreateScenario();
  const navigate = useNavigate({ from: "/scenarios/new" });
  const active = useRef(true);
  const form = useFormStore({
    defaultValues: { title: "" } satisfies CreateScenarioInput,
  });
  const submitting = useStoreState(form, "submitting");
  const hasSubmitted = useStoreState(
    form,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [createdScenario, setCreatedScenario] = useState<Scenario | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  useCreateScenarioFormValidation(form);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function openScenario(scenario: Scenario) {
    try {
      await navigate({
        to: "/scenarios/$scenarioId",
        params: { scenarioId: scenario.id },
      });
    } catch (cause) {
      if (!active.current) {
        return;
      }

      reportError("scenario.open-created", cause);
      setOperationError("The scenario was created, but it could not be opened.");
    }
  }

  useFormSubmit(form, async (state) => {
    let scenario = createdScenario;

    if (!scenario) {
      try {
        const input = createScenarioInputSchema.parse(state.values);
        scenario = await createScenarioMutation.mutateAsync(input);
      } catch (cause) {
        reportError("scenario.create", cause);

        if (active.current) {
          setOperationError("Could not create the scenario.");
        }
        return;
      }

      if (!active.current) {
        return;
      }

      setCreatedScenario(scenario);
    }

    await openScenario(scenario);
  });

  let actionLabel = "Create scenario";

  if (createdScenario) {
    actionLabel = submitting ? "Opening…" : "Open scenario";
  } else if (submitting) {
    actionLabel = "Creating…";
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/scenarios" />}>Scenarios</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Page id="create-scenario-page">Create scenario</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <AriakitForm
            store={form}
            aria-busy={submitting || undefined}
            aria-labelledby="create-scenario-page"
            onSubmit={() => setOperationError(null)}
            render={<FormLayout.Root style={styles.form} />}
            resetOnSubmit={false}
            validateOnBlur={hasSubmitted}
            validateOnChange={hasSubmitted}
          >
            <Field.Root>
              <FormLabel name={form.names.title} render={<Field.Label />}>
                Title
              </FormLabel>
              <FormDescription name={form.names.title} render={<Field.Description />}>
                Up to {SCENARIO_TITLE_MAX_LENGTH} characters.
              </FormDescription>
              <Field.Control>
                <FormInput
                  name={form.names.title}
                  render={
                    <Input
                      type="text"
                      autoFocus
                      disabled={submitting || Boolean(createdScenario)}
                      maxLength={SCENARIO_TITLE_MAX_UTF16_LENGTH}
                      placeholder="Scenario title"
                      style={styles.input}
                    />
                  }
                />
                <Button type="submit" disabled={submitting} style={styles.submitButton}>
                  {actionLabel}
                </Button>
              </Field.Control>
              <FormError name={form.names.title} render={<Field.Error />} />
            </Field.Root>

            <FormLayout.Status
              role={operationError ? "alert" : undefined}
              tone={operationError ? "danger" : "neutral"}
            >
              {operationError}
            </FormLayout.Status>
          </AriakitForm>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  form: {
    maxWidth: "34rem",
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  submitButton: {
    minWidth: "7.5rem",
  },
});
