export const PERMISSIONS = [
  { name: 'company:view', module: 'company' },
  { name: 'company:update', module: 'company' },
  { name: 'member:view', module: 'member' },
  { name: 'member:invite', module: 'member' },
  { name: 'member:update', module: 'member' },
  { name: 'member:remove', module: 'member' },
  { name: 'project:create', module: 'project' },
  { name: 'project:view', module: 'project' },
  { name: 'project:update', module: 'project' },
  { name: 'project:delete', module: 'project' },
  { name: 'issue:create', module: 'issue' },
  { name: 'issue:view', module: 'issue' },
  { name: 'issue:update', module: 'issue' },
  { name: 'issue:edit-own', module: 'issue' },
  { name: 'issue:submit-fix', module: 'issue' },
  { name: 'issue:retest', module: 'issue' },
  { name: 'issue:dev-status', module: 'issue' },
  { name: 'issue:assign', module: 'issue' },
  { name: 'issue:delete', module: 'issue' },
  { name: 'issue:close', module: 'issue' },
  { name: 'issue:reopen', module: 'issue' },
  { name: 'testcase:create', module: 'testcase' },
  { name: 'testcase:view', module: 'testcase' },
  { name: 'testcase:update', module: 'testcase' },
  { name: 'testcase:delete', module: 'testcase' },
  { name: 'testcase:execute', module: 'testcase' },
  { name: 'release:create', module: 'release' },
  { name: 'release:update', module: 'release' },
  { name: 'release:approve', module: 'release' },
  { name: 'report:view', module: 'report' },
  { name: 'report:export', module: 'report' },
  { name: 'audit:view', module: 'audit' },
] as const;

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'company-admin': 'Company Admin',
  'project-manager': 'Project Manager',
  qa: 'QA Tester',
  developer: 'Developer',
};

export const JOINABLE_ROLE_SLUGS = ['qa', 'developer', 'project-manager'] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'company-admin': PERMISSIONS.map((p) => p.name),
  'project-manager': [
    'company:view', 'member:view', 'project:create', 'project:view',
    'project:update', 'project:delete', 'issue:create', 'issue:view',
    'issue:update', 'issue:edit-own', 'issue:assign', 'issue:submit-fix',
    'issue:retest', 'issue:dev-status', 'issue:close', 'issue:reopen',
    'testcase:create', 'testcase:view', 'testcase:update', 'testcase:execute',
    'release:create', 'release:update', 'release:approve',
    'report:view', 'report:export',
  ],
  qa: [
    'company:view', 'member:view', 'project:view',
    'issue:create', 'issue:view', 'issue:edit-own',
    'issue:retest', 'issue:close', 'issue:reopen',
    'testcase:create', 'testcase:view', 'testcase:update',
    'testcase:delete', 'testcase:execute', 'report:view',
  ],
  developer: [
    'company:view', 'member:view', 'project:view',
    'issue:view', 'issue:submit-fix', 'issue:dev-status',
    'testcase:view',
  ],
};

/** Statuses developers may set manually (READY_FOR_QA is set via submit-fix only). */
export const DEVELOPER_SETTABLE_STATUSES = [
  'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED',
] as const;

/** Statuses QA may set during verification / closure workflow. */
export const QA_SETTABLE_STATUSES = [
  'RETESTING', 'PASSED', 'REOPENED', 'CLOSED',
  'DUPLICATE', 'WONT_FIX', 'NOT_A_BUG', 'DEFERRED', 'CANCELLED',
] as const;

export const ISSUE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'READY_FOR_QA', 'ASSIGNED'],
  BLOCKED: ['IN_PROGRESS'],
  READY_FOR_QA: ['RETESTING', 'IN_PROGRESS'],
  RETESTING: ['PASSED', 'FAILED', 'REOPENED'],
  FAILED: ['REOPENED', 'IN_PROGRESS'],
  REOPENED: ['IN_PROGRESS', 'ASSIGNED'],
  PASSED: ['CLOSED'],
  CLOSED: ['REOPENED'],
  DUPLICATE: [],
  WONT_FIX: [],
  NOT_A_BUG: [],
  DEFERRED: ['OPEN'],
  CANCELLED: ['OPEN'],
};
