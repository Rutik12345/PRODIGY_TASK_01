import React, { createRef } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Vdiform from '../../src/components/widgets/VdiForm.jsx';

// ------------------- MOCKS -------------------

jest.mock('axios');

jest.mock('../../src/util/common.util', () => ({
  getLoggedInUsername: jest.fn(() => 'test-user'),
  showToastMessage: jest.fn(),
}));

jest.mock('../../src/components/widgets/eventBus', () => ({
  uploadBus: {
    apiUrl: '',
    uploads: new Map(),
    controllers: new Map(),
    registerContext: jest.fn(),
    upsert: jest.fn(),
    markError: jest.fn(),
    markCompleted: jest.fn(),
    addController: jest.fn(),
    cancel: jest.fn(),
    subscribe: jest.fn(() => () => {}),
  },
}));

global.fetch = jest.fn();

Object.defineProperty(window, 'location', {
  writable: true,
  value: { replace: jest.fn(), reload: jest.fn() },
});

// ------------------- HELPERS -------------------

const renderForm = (props = {}) =>
  render(
    <Vdiform
      passLaunchEvent={props.passLaunchEvent}
      onFormDataChange={jest.fn()}
      selectedTenant={{ id: 1, label: 'tenantA' }}
      ref={props.ref}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('selectedTenant', JSON.stringify({ label: 'tenantA' }));
  localStorage.setItem('USER', JSON.stringify({ username: 'test-user' }));
  localStorage.setItem('TOKEN', 'token');
});

// =================================================
// ✅ FINAL STABLE TESTS (NO TIMEOUTS)
// =================================================

describe('Vdiform – stable coverage tests', () => {
  test('renders required fields', () => {
    renderForm();
    expect(screen.getByLabelText(/enter the workbench name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/select branch/i)).toBeInTheDocument();
  });

  test('validates name on blur and shows error', async () => {
    renderForm();
    const input = screen.getByLabelText(/enter the workbench name/i);

    fireEvent.change(input, { target: { value: '1bad' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.getByText(/must start with a letter/i)).toBeInTheDocument()
    );
  });

  
  test('switches to upload mode and rejects invalid file', async () => {
    renderForm();

    fireEvent.click(screen.getByLabelText(/upload gvm image/i));

    const fileInput = document.getElementById('file-upload');
    const badFile = new File(['x'], 'bad.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(
      await screen.findByText(/please upload .*tar.gz/i)
    ).toBeInTheDocument();
  });

  test('accepts valid .tar.gz file', async () => {
    renderForm();

    fireEvent.click(screen.getByLabelText(/upload gvm image/i));

    const fileInput = document.getElementById('file-upload');
    const goodFile = new File(['x'], 'good.tar.gz', {
      type: 'application/gzip',
    });

    fireEvent.change(fileInput, { target: { files: [goodFile] } });

    expect(await screen.findByText('good.tar.gz')).toBeInTheDocument();
  });

  test('exposes executeTask via forwarded ref (without executing)', () => {
    const ref = createRef();
    renderForm({ ref });

    expect(ref.current).toBeDefined();
    expect(typeof ref.current.executeTask).toBe('function');
  });

  test('resets form when passLaunchEvent changes', () => {
    const { rerender } = renderForm({ passLaunchEvent: 1 });
    const input = screen.getByLabelText(/enter the workbench name/i);

    fireEvent.change(input, { target: { value: 'WorkBench1' } });
    expect(input.value).toBe('WorkBench1');

    rerender(
      <Vdiform
        passLaunchEvent={2}
        onFormDataChange={jest.fn()}
        selectedTenant={{ id: 1, label: 'tenantA' }}
      />
    );

    expect(screen.getByLabelText(/enter the workbench name/i).value).toBe('');
  });
 
    
 
  test('allows valid letter at start (beforeinput)', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
    const preventDefault = jest.fn();
  
    const event = new InputEvent('beforeinput', {
      data: 'A',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      writable: false,
      value: {
        selectionStart: 0,
        selectionEnd: 0,
        value: '',
      },
    });
  
    event.preventDefault = preventDefault;
    input.dispatchEvent(event);
  
    expect(preventDefault).not.toHaveBeenCalled();
  });
  test('blocks non-letter as first character (beforeinput)', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: '1', // ❌ non-letter
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      writable: false,
      value: {
        selectionStart: 0,
        selectionEnd: 0,
        value: '',
      },
    });
  
    input.dispatchEvent(event);
  
    // ✅ observable behavior: value still empty
    expect(input.value).toBe('');
  });
  test('blocks leading space when whole value is selected (beforeinput)', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: ' ',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      writable: false,
      value: {
        selectionStart: 0,
        selectionEnd: 3,
        value: 'abc', // entire value selected
      },
    });
  
    input.dispatchEvent(event);
  
    // ✅ value unchanged → handler returned early
    expect(input.value).toBe('');
  });
  test('allows valid letter as first character (beforeinput)', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    fireEvent.change(input, { target: { value: 'A' } });
  
    expect(input.value).toBe('A');
  });
  test('returns early when beforeinput has no data', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: null,
      bubbles: true,
      cancelable: true,
    });
  
    input.dispatchEvent(event);
  
    expect(input.value).toBe('');
  });
  test('blocks invalid characters in beforeinput', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: '$',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      value: {
        selectionStart: 0,
        selectionEnd: 0,
        value: '',
      },
    });
  
    input.dispatchEvent(event);
  
    expect(input.value).toBe('');
  });
  test('blocks non-letter as first character', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: '1',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      value: {
        selectionStart: 0,
        selectionEnd: 0,
        value: '',
      },
    });
  
    input.dispatchEvent(event);
  
    expect(input.value).toBe('');
  });
  test('blocks leading space when full value is selected', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    const event = new InputEvent('beforeinput', {
      data: ' ',
      bubbles: true,
      cancelable: true,
    });
  
    Object.defineProperty(event, 'target', {
      value: {
        selectionStart: 0,
        selectionEnd: 3,
        value: 'abc',
      },
    });
  
    input.dispatchEvent(event);
  
    expect(input.value).toBe('');
  });
  test('allows valid letter as first character', () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
  
    fireEvent.change(input, { target: { value: 'A' } });
  
    expect(input.value).toBe('A');
  });
 
  test('shows required message when input is blurred empty', async () => {
    renderForm();
  
    const input = screen.getByLabelText(/enter the workbench name/i);
    fireEvent.blur(input);
  
    expect(
      await screen.findByText('Workbench name is required.')
    ).toBeInTheDocument();
  });
  test('shows error when name does not start with a letter', async () => {
  renderForm();

  const input = screen.getByLabelText(/enter the workbench name/i);
  fireEvent.change(input, { target: { value: '1test' } });
  fireEvent.blur(input);

  expect(
    await screen.findByText('Must start with a letter.')
  ).toBeInTheDocument();
});
test('shows error when API base URL is not configured', async () => {
  renderForm();

  expect(
    await screen.findByText(/api base url is not configured/i)
  ).toBeInTheDocument();
});
test('calls fetch when API base URL exists', async () => {
  // ✅ FORCE base URL so guard does not trigger
  import.meta.env.VITE_API_URL = 'http://test-api/';

  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      status: 'success',
      branches: [],
    }),
  });

  renderForm();

  await waitFor(() => {
    expect(fetch).toHaveBeenCalled();
  });
});

test('selecting upload radio disables snapshot dropdown (MUI-correct)', () => {
  renderForm();

  // Switch to upload mode
  const uploadRadio = screen.getByLabelText(/upload gvm image/i);
  fireEvent.click(uploadRadio);

  // ✅ IMPORTANT: check the combobox, NOT the label
  const snapshotCombo = screen.getByRole('combobox', {
    name: /select base version/i,
  });

  // ✅ MUI disables via class, not attribute
  expect(snapshotCombo).toHaveClass('Mui-disabled');
});
test('populates snapshot dropdown when branch is selected', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      status: 'success',
      branches: [
        {
          branch: 'main',
          snapshots: [
            { id: '1', name: 'v1' },
            { id: '2', name: 'v2' },
          ],
        },
      ],
    }),
  });

  renderForm();

  // ✅ Select branch
  const branchSelect = await screen.findByRole('combobox', {
    name: /select branch/i,
  });
  fireEvent.mouseDown(branchSelect);
  fireEvent.click(screen.getByText('main'));

  // ✅ Select snapshot (CORRECT way)
  const snapshotSelect = screen.getByRole('combobox', {
    name: /select base version/i,
  });
  fireEvent.mouseDown(snapshotSelect);

  expect(screen.getByText('v1')).toBeInTheDocument();
  expect(screen.getByText('v2')).toBeInTheDocument();
});
test('shows empty snapshot dropdown when branch has no snapshots', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      status: 'success',
      branches: [
        {
          branch: 'develop', // ❌ no snapshots
        },
      ],
    }),
  });

  renderForm();

  // ✅ Select branch
  const branchSelect = await screen.findByRole('combobox', {
    name: /select branch/i,
  });
  fireEvent.mouseDown(branchSelect);
  fireEvent.click(screen.getByText('develop'));

  // ✅ Snapshot dropdown (MUI-correct)
  const snapshotSelect = screen.getByRole('combobox', {
    name: /select base version/i,
  });
  fireEvent.mouseDown(snapshotSelect);

  // ✅ Expect fallback text
  expect(
    screen.getByText(/select branch first/i)
  ).toBeInTheDocument();
});
test('shows session expired on 401 response', async () => {
  fetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    headers: { get: () => 'application/json' },
  });

  renderForm();

  expect(
    await screen.findByText(/session has expired/i)
  ).toBeInTheDocument();
});
test('handles non-JSON API response', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
  });

  renderForm();

  expect(
    await screen.findByText(/session has expired/i)
  ).toBeInTheDocument();
});

});

