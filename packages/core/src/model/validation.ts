import type { z } from 'zod';
import type { IssueCode, IssueValues, ValidationIssue } from './issues';
import { formatPath, ProjectSchema, type Project } from './project';

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; issues: ValidationIssue[] };

interface IssueParams {
  issueCode?: IssueCode;
  values?: IssueValues;
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    const params = (issue.code === 'custom' ? issue.params : undefined) as IssueParams | undefined;
    return {
      path: formatPath(issue.path),
      message: issue.message,
      ...(params?.issueCode && { code: params.issueCode, values: params.values ?? {} }),
    };
  });
}

/**
 * Checks everything that must always hold, also for an unfinished project in the editor
 * ("storable"). Whether a stage can be previewed or exported is checkRenderReadiness().
 */
export function validateProject(input: unknown): ValidationResult<Project> {
  const result = ProjectSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: toValidationIssues(result.error) };
}

/** One line per issue, for logs and error responses. */
export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, message }) => (path ? `${path}: ${message}` : message)).join('\n');
}
