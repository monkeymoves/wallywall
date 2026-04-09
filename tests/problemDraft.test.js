import { describe, expect, test } from 'vitest';

import {
  applyDraftToForm,
  emptyProblemDraft,
  formToDraft,
  isDraftDirty,
  problemToDraft,
} from '../public/problemDraft.js';

function createDomStub() {
  return {
    problemName: { value: '' },
    problemDesc: { value: '' },
    problemGrade: { value: '' },
  };
}

describe('problemDraft', () => {
  test('emptyProblemDraft and problemToDraft normalize text and holds', () => {
    expect(emptyProblemDraft()).toEqual({
      name: '',
      description: '',
      grade: '',
      holds: [],
    });

    expect(problemToDraft({
      name: '  Warm Up  ',
      description: '  quiet feet  ',
      grade: 'V2',
      holds: [{ xRatio: 0.5, yRatio: 0.5, type: 'hold' }],
    })).toEqual({
      name: 'Warm Up',
      description: 'quiet feet',
      grade: 'V2',
      holds: [{ xRatio: 0.5, yRatio: 0.5, type: 'hold' }],
    });
  });

  test('applyDraftToForm and formToDraft map between DOM and draft state', () => {
    const dom = createDomStub();
    applyDraftToForm(dom, {
      name: 'Project',
      description: 'Big move',
      grade: 'V6',
    });

    expect(formToDraft(dom, [{ xRatio: 0.2, yRatio: 0.8, type: 'start' }])).toEqual({
      name: 'Project',
      description: 'Big move',
      grade: 'V6',
      holds: [{ xRatio: 0.2, yRatio: 0.8, type: 'start' }],
    });
  });

  test('isDraftDirty compares normalized drafts rather than raw input formatting', () => {
    expect(isDraftDirty(
      {
        name: 'Warm Up',
        description: 'Quiet feet',
        grade: 'V1',
        holds: [],
      },
      {
        name: '  Warm Up ',
        description: 'Quiet feet  ',
        grade: 'V1',
        holds: [],
      }
    )).toBe(false);

    expect(isDraftDirty(
      {
        name: 'Warm Up',
        description: 'Quiet feet',
        grade: 'V1',
        holds: [],
      },
      {
        name: 'Warm Up',
        description: 'Different beta',
        grade: 'V1',
        holds: [],
      }
    )).toBe(true);
  });
});
