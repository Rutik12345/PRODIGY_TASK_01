// working

import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Box, TextField, Radio, FormControlLabel, Button } from '@mui/material';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormHelperText from '@mui/material/FormHelperText';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import UploadIcon from '@mui/icons-material/FileUpload';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

import axios from 'axios';

import { getLoggedInUsername, showToastMessage } from '../../util/common.util';

// IMPORTANT: Use YOUR event bus implementation (the one you posted)
import { uploadBus } from '../widgets/eventBus'; // <-- adjust path if needed

const Vdiform = forwardRef(({ passLaunchEvent, onFormDataChange, selectedTenant }, ref) => {
  const apiUrl = import.meta.env.VITE_API_URL;

  // ---------------- UI state ----------------
  const [inputValue, setInputValue] = useState('');
  const [selectedRadio, setSelectedRadio] = useState('');
  const [snapShotValue, setSnapShotValue] = useState('');
  const [dropdownDisabled, setDropdownDisabled] = useState(true);
  const [brachValue, setBrachValue] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');

  const [snapshotDropdownOptions, setSnapshotDropdownOptions] = useState([]);
  const [branchdropdownOptions, setBranchdropdownOptions] = useState([]);
  const [loadingDropdown, setLoadingDropdown] = useState(true);
  const [dropdownError, setDropdownError] = useState(null);
  const [branchdropdownError, setBranchdropdownError] = useState(null);
  const [data, setData] = useState(null);

  const [loading, setLoading] = React.useState(false);
  const [uploadMessage, setUploadMessage] = React.useState('');
  const [uploadSuccess, setUploadSuccess] = React.useState(false);
  const [uploadError, setUploadError] = React.useState(false);
  const [uploadId, setUploadId] = useState('');

  const [SelectedGVMFile, setSelectedGVMFile] = React.useState(null);

  // ---- safety: avoid setState on unmounted ----
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const safeSet = (setter) => (val) => { if (isMountedRef.current) setter(val); };

  // ===========================
  // Helpers used by upload flow
  // ===========================
  function joinUrl(base, path) {
    const b = String(base || '').replace(/\/+$/, '');
    const p = String(path || '').replace(/^\/+/, '');
    return `${b}/${p}`;
  }

  function splitFileIntoParts(blobFile, chunkSizeBytes) {
    const parts = [];
    let offset = 0;
    let partNumber = 1;
    while (offset < blobFile.size) {
      const end = Math.min(offset + chunkSizeBytes, blobFile.size);
      const blob = blobFile.slice(offset, end);
      parts.push({ partNumber, blob });
      offset = end;
      partNumber += 1;
    }
    return parts;
  }

  async function sha256Base64(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const bytes = new Uint8Array(hashBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function isRetryableError(err) {
    // axios error
    if (err?.response?.status) {
      const s = err.response.status;
      return s >= 500 || s === 429; // retry on server errors and throttling
    }
    // fetch / network
    if (err?.name === 'AbortError') return false;
    return true;
  }

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // ======================
  // Upload (kept in this component) but integrated with uploadBus
  // ======================
  const performTaskAsync = () => {
    return new Promise(async (resolve, reject) => {
      // ---- Config ----
      const file = SelectedGVMFile;
      const apiBaseUrl = apiUrl;
      const chunkSizeMb = 100;
      const maxConcurrent = 6;
      const maxRetries = 3;
      const baseDelayMs = 500;
      const jitterRatio = 0.2;
      const USE_CHECKSUM = false; // flip if your server presigns checksums

      // ---- UI state ----
      setFileError('');
      safeSet(setLoading)(true);
      safeSet(setUploadMessage)('Uploading in progress, please wait...');
      safeSet(setUploadSuccess)(false);
      safeSet(setUploadError)(false);

      if (!file) {
        showToastMessage('ERROR', 'No file selected');
        safeSet(setLoading)(false);
        return;
      }

      // Make sure bus knows the API base (needed for its cancel() beacons)
      uploadBus.apiUrl = apiBaseUrl;

      // Shared context
      const username = getLoggedInUsername();
      const tenantName = JSON.parse(localStorage.getItem('selectedTenant'))?.label;
      const workspaceName = inputValue;

      // Prepare a local, upload-scoped context (safe for parallel uploads)
      let localUploadId = null;

      // 1) Initiate
      try {
        const initiatePath = apiBaseUrl.includes('/api/v1')
          ? 'catalog/upload-initiate'
          : '/api/v1/catalog/upload-initiate';
        const initiateUrl = joinUrl(apiBaseUrl, initiatePath);

        const initResp = await axios.post(
          initiateUrl,
          { username, tenant_name: tenantName, workspace_name: workspaceName, user_id: JSON.parse(localStorage.getItem('userData'))?.userId },
          { headers: { 'Content-Type': 'application/json' } }
        );

        localUploadId = initResp?.data?.uploadId;
        setUploadId(localUploadId);

        // Register per-upload context into the bus
        uploadBus.registerContext({
          apiUrl: apiBaseUrl,
          uploadId: localUploadId,
          username,
          tenantName,
          workspaceName,
        });
        // Initial status
        uploadBus.upsert(localUploadId, {
          status: 'running',
          message: 'Initialized upload',
          progressPct: 0,
          fileName: file.name,
        });
      } catch (error) {
        console.error('Upload initiate failed:', error?.response || error);
        showToastMessage('ERROR', error?.message || 'Upload initiate failed');
        uploadBus.markError(null, error?.message || 'Upload initiate failed');
        safeSet(setLoading)(false);
        setFileName('');
        return;
      }

      // 2) Split file parts
      const chunkSizeBytes = chunkSizeMb * 1024 * 1024;
      const parts = splitFileIntoParts(file, chunkSizeBytes);
      const totalParts = parts.length;

      const uploadedPartsMap = {}; // PartNumber -> { PartNumber, ETag }
      const computeProgressPct = () =>
        Math.round((Object.keys(uploadedPartsMap).length / totalParts) * 100) || 0;

      // 3) Optional checksums
      let perPartChecksums = null;
      if (USE_CHECKSUM) {
        uploadBus.upsert(localUploadId, {
          status: 'running',
          message: 'Calculating checksums...',
        });
        perPartChecksums = [];
        for (let i = 0; i < totalParts; i++) {
          const buf = await parts[i].blob.arrayBuffer();
          perPartChecksums.push(await sha256Base64(buf));
        }
      }

      // 3b) Presign (bulk)
      let urlsByPartNumber = {};
      try {
        const presignPath = apiBaseUrl.includes('/api/v1')
          ? 'catalog/presigned-url-generate'
          : '/api/v1/catalog/presigned-url-generate';
        const presignUrl = joinUrl(apiBaseUrl, presignPath);

        const body = {
          upload_id: localUploadId,
          part_number: totalParts,
          username,
          tenant_name: tenantName,
          workspace_name: workspaceName,
          ...(USE_CHECKSUM ? { checksums_sha256: perPartChecksums } : {}),
        };

        const presignedResp = await axios.post(presignUrl, body, {
          headers: { 'Content-Type': 'application/json' },
        });
        const arr = presignedResp?.data?.urls;
        if (!Array.isArray(arr) || arr.length === 0) {
          throw new Error('Invalid presigned URL response (missing urls[])');
        }
        urlsByPartNumber = arr.reduce((acc, item) => {
          const cleanUrl = String(item.url).replace(/&amp;amp;amp;/g, '&amp;amp;');
          acc[Number(item.partNumber)] = cleanUrl;
          return acc;
        }, {});
      } catch (e) {
        console.error('Failed to get presigned URLs:', e);
        showToastMessage('ERROR', e?.message || 'Failed to get presigned URLs');
        uploadBus.markError(localUploadId, e?.message || 'Failed to get presigned URLs');
        safeSet(setLoading)(false);
        setFileName('');
        return;
      }

      // 4) Upload parts concurrently (parallel) with retry + AbortController per part
      async function uploadPartWithRetry(url, arrayBuffer, partNumber, perChecksums, maxRetriesLocal) {
        let attempt = 0;
        while (attempt < maxRetriesLocal) {
          attempt += 1;

          // Create per-part abort controller and register with bus
          const controller = new AbortController();
          uploadBus.addController(localUploadId, controller);

          try {
            const headers = {};
            if (USE_CHECKSUM && perChecksums) {
              headers['x-amz-checksum-sha256'] = perChecksums[partNumber - 1];
            }

            const resp = await fetch(url, {
              method: 'PUT',
              body: arrayBuffer,
              headers,
              signal: controller.signal,
            });

            // remove controller once completed / failed
            try {
              const list = uploadBus.controllers.get(localUploadId) || [];
              uploadBus.controllers.set(
                localUploadId,
                list.filter((c) => c !== controller)
              );
            } catch {}

            if (!resp.ok) {
              const text = await resp.text().catch(() => '');
              throw new Error(`HTTP ${resp.status} ${text}`);
            }

            const etag = resp.headers.get('ETag');
            if (!etag) throw new Error(`Empty ETag for part ${partNumber}, attempt ${attempt}`);

            return etag.replace(/"/g, '');
          } catch (err) {
            // cleanup controller on error too
            try {
              const list = uploadBus.controllers.get(localUploadId) || [];
              uploadBus.controllers.set(
                localUploadId,
                list.filter((c) => c !== controller)
              );
            } catch {}

            const retryable = isRetryableError(err);
            const last = attempt >= maxRetriesLocal;

            // If it was canceled, bubble up immediately
            if (err?.name === 'AbortError') throw err;

            if (!retryable || last) throw err;

            const backoff = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = backoff * jitterRatio * (Math.random() * 2 - 1);
            const sleepMs = Math.max(0, Math.floor(backoff + jitter));
            await delay(sleepMs);
          }
        }
        throw new Error(`Part ${partNumber} failed after ${maxRetriesLocal} attempts`);
      }

      let index = 0;
      const worker = async () => {
        while (true) {
          const myIndex = index++;
          if (myIndex >= parts.length) return;

          const { partNumber, blob } = parts[myIndex];
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const url = urlsByPartNumber[partNumber];
            if (!url) throw new Error(`Missing presigned URL for part ${partNumber}`);

            const etag = await uploadPartWithRetry(
              url,
              arrayBuffer,
              partNumber,
              perPartChecksums,
              maxRetries
            );

            uploadedPartsMap[partNumber] = { PartNumber: partNumber, ETag: etag };

            const pct = computeProgressPct();
            uploadBus.upsert(localUploadId, {
              status: 'running',
              message: `Uploaded part ${partNumber}/${totalParts}`,
              progressPct: pct,
              fileName: file.name,
            });
          } catch (err) {
            // If canceled via uploadBus.cancel(uploadId), fetch throws AbortError
            const wasCanceled =
              uploadBus.uploads.get(localUploadId)?.status === 'canceled' ||
              err?.name === 'AbortError';

            if (!wasCanceled) {
              uploadBus.markError(localUploadId, err?.message || `Part ${partNumber} failed`);
            }
            throw err; // Let Promise.all fail-fast
          }
        }
      };

      try {
        uploadBus.upsert(localUploadId, {
          status: 'running',
          message: `Uploading ${totalParts} parts...`,
          progressPct: 0,
          fileName: file.name,
        });

        // run N workers in parallel
        const workerCount = Math.min(maxConcurrent, parts.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      } catch (err) {
        const isCanceled = uploadBus.uploads.get(localUploadId)?.status === 'canceled';

        if (isCanceled) {
          showToastMessage('INFO', 'Upload cancelled.');
        } else {
          // showToastMessage('ERROR', 'One or more parts failed after retries');
        }

        safeSet(setLoading)(false);
        // do NOT call complete; we’re done here
        reject({
          success: false,
          GvmFileName: file.name,
          message: 'Upload cancelled' ,
        });
        return;
      }

      // 5) Verify all parts
      const completedParts = Object.values(uploadedPartsMap).sort((a, b) => a.PartNumber - b.PartNumber);
      if (completedParts.length !== totalParts) {
        const missing = [];
        for (let i = 1; i <= totalParts; i++) if (!uploadedPartsMap[i]) missing.push(i);
        uploadBus.markError(localUploadId, `Some parts failed: ${missing.join(', ')}`);
        showToastMessage('ERROR', `Some parts failed: ${missing.join(', ')}`);
        safeSet(setLoading)(false);
        reject({ success: false, GvmFileName: file.name, message: 'Missing parts' });
        return;
      }

      // 6) Complete multipart upload
      try {
        uploadBus.upsert(localUploadId, {
          status: 'completing',
          message: 'Finalizing upload...',
          progressPct: 100,
        });

        const formattedParts = completedParts.map((p) => ({
          ETag: String(p.ETag).replaceAll('"', ''),
          PartNumber: Number(p.PartNumber),
          ...(USE_CHECKSUM ? { ChecksumSHA256: (perPartChecksums?.[p.PartNumber - 1] || null) } : {}),
        }));

        const objectKey = `${workspaceName}/${tenantName}/${username}/GVM.tar.gz`;

        const completePath = apiBaseUrl.includes('/api/v1')
          ? 'catalog/upload-complete'
          : '/api/v1/catalog/upload-complete';
        const completeUrl = joinUrl(apiBaseUrl, completePath);

        await axios.post(
          completeUrl,
          {
            key: objectKey,
            upload_id: localUploadId,
            workspace_name: workspaceName,
            username,
            tenant_name: tenantName,
            parts: formattedParts,
          },
          { headers: { 'Content-Type': 'application/json' } }
        );

        showToastMessage('SUCCESS', 'Upload completed');
        safeSet(setUploadSuccess)(true);
        safeSet(setUploadMessage)('Upload completed!');
        uploadBus.markCompleted(localUploadId);

        resolve({
          success: true,
          GvmFileName: file.name,
          message: 'Upload completed in child',
        });
      } catch (error) {
        console.error('Error completing upload:', error?.response || error);
        safeSet(setUploadError)(true);
        safeSet(setUploadMessage)('Upload failed.');
        showToastMessage('ERROR', error?.message || 'Upload complete failed');
        uploadBus.markError(localUploadId, error?.message || 'Upload complete failed');

        reject({
          success: false,
          GvmFileName: file.name,
          message: 'Upload failed in child',
        });
      } finally {
        safeSet(setLoading)(false);
      }
    });
  };

  useImperativeHandle(ref, () => ({ executeTask: performTaskAsync }));

  // ==============
  // Branch/snapshot (unchanged logic from your original)
  // ==============
  const fetchBranchOptions = async () => {
    setLoadingDropdown(true);
    setBranchdropdownError(null);

    try {
      const baseUrl = apiUrl || import.meta?.env?.VITE_API_URL || window?.VITE_API_URL || '';
      if (!baseUrl) {
        setBranchdropdownError('API base URL is not configured.');
        showToastMessage('ERROR', 'API base URL (VITE_API_URL) is not defined.');
        return;
      }

      const rawUser = localStorage.getItem('USER');
      const rawTenant = localStorage.getItem('selectedTenant');
      const token = localStorage.getItem('TOKEN');

      const userDetail = rawUser ? JSON.parse(rawUser) : null;
      const tenant = rawTenant ? JSON.parse(rawTenant) : null;

      if (!userDetail?.username) {
        setBranchdropdownError('Missing user details. Please log in again.');
        showToastMessage('ERROR', 'Missing user details. Please log in again.');
        return;
      }
      if (!tenant?.label) {
        setBranchdropdownError('No tenant selected.');
        showToastMessage('ERROR', 'No tenant selected.');
        return;
      }
      if (!token) {
        setBranchdropdownError('Authentication token not found. Please log in again.');
        showToastMessage('ERROR', 'Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch(`${baseUrl}catalog/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: userDetail.username, tenant_name: tenant.label }),
        redirect: 'follow',
      });

      if (response.status === 401) {
        setBranchdropdownError('Your session has expired. Please login again.');
        showToastMessage('ERROR', 'Your session has expired. Please login again.');
        return;
      }
      if (!response.ok) {
        setBranchdropdownError(`Failed to fetch branches. HTTP ${response.status}`);
        showToastMessage('ERROR', `Failed to fetch branches. HTTP ${response.status}`);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setBranchdropdownError('Your session has expired. Please login again.');
        showToastMessage('ERROR', 'Your session has expired. Please login again.');
        return;
      }

      const json = await response.json();
      setData(json);

      if (json?.status && String(json.status).toLowerCase() !== 'success') {
        const msg = json?.message || 'Unable to fetch branches.';
        setBranchdropdownError(msg);
        showToastMessage('ERROR', msg);
        setBranchdropdownOptions([]);
        setSnapshotDropdownOptions([]);
        return;
      }

      const branches =
        (Array.isArray(json?.branches) && json.branches) ||
        (Array.isArray(json?.data?.branches) && json.data.branches) ||
        (Array.isArray(json?.data) && json.data) ||
        [];

      if (!Array.isArray(branches) || branches.length === 0) {
        setBranchdropdownOptions([]);
        setSnapshotDropdownOptions([]);
        setBranchdropdownError('No branches available for the selected tenant.');
        // showToastMessage('WARN', 'No snapshots available for the selected tenant.');
        return;
      }

      const branchOptions = branches.map((b) => {
        const value = typeof b === 'string' ? b : b?.branch ?? '';
        return { value, label: value };
      });

      setBranchdropdownOptions(branchOptions);
      setSnapshotDropdownOptions([]);
      setBranchdropdownError(null);
    } catch (error) {
      console.error('Error fetching dropdown options:', error);
      setDropdownError(error?.message || 'Unexpected error');
      setBranchdropdownError('We could not load branches. Please try again later.');
      showToastMessage('ERROR', "We're experiencing a temporary issue. Please try again after few minutes.");
    } finally {
      setLoadingDropdown(false);
    }
  };

  // Populate snapshots when a branch is selected
  useEffect(() => {
    if (brachValue) {
      const selectedBranchData = data?.branches?.find((branch) => branch.branch === brachValue);
      if (selectedBranchData?.snapshots) {
        const snapshotOptions = selectedBranchData.snapshots.map((item) => ({
          value: item.id,
          label: item.name,
        }));
        setSnapshotDropdownOptions(snapshotOptions);
      } else {
        setSnapshotDropdownOptions([]);
      }
    } else {
      setSnapshotDropdownOptions([]);
    }
  }, [brachValue, data]);

  // useEffect(() => {
  //   setSnapShotValue('');
  //   setInputValue('');
  // }, [passLaunchEvent]);
  useEffect(() => {
  setSnapShotValue('');
  setInputValue('');
+ // Reset selected GVM file
 setSelectedGVMFile(null);
 setFileName('');
+setFileError('');
 const fileEl = document.getElementById('file-upload');
 if (fileEl) { try { fileEl.value = ''; } catch {} }
 setSelectedRadio('');
 // Optional: notify parent so it clears fileName in its formData mirror
 try { onFormDataChange?.({ inputValue: '', snapShotValue: '', fileName: '' }); } catch {}
}, [passLaunchEvent]);

  useEffect(() => {
    fetchBranchOptions();
  }, [selectedTenant]);

  // ==============
  // UI handlers
  // ==============
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    setSelectedGVMFile(file);
    if (file) {
      const allowedFileType = 'application/gzip';
      const allowedFileExtension = '.tar.gz';
      if (file.type === allowedFileType || file.name.endsWith(allowedFileExtension)) {
        setFileName(file.name);
        setFileError('');
        onFormDataChange({ inputValue, snapShotValue, fileName: file.name });
      } else {
        setFileError('Please upload .tar.gz file.');
        setFileName('');
        return;
      }
    } else {
      setFileName('');
    }
  };

  const handleRadioChange = (event) => {
    setFileError('');
    setSelectedRadio(event.target.value);
    if (event.target.value === 'upload') {
      setDropdownDisabled(true);
      setSnapShotValue('');
      setBrachValue('');
    } else {
      setDropdownDisabled(false);
      setSnapShotValue('');
      setBrachValue('');
    }
  };

  const handleUnlock = () => {
    setDropdownDisabled(false);
    setSelectedRadio('dropdown');
  };

// Allowed characters anywhere while typing
const allowedCharsRegex = /^[A-Za-z0-9 _-]*$/;

// Final validation: 5–30, starts with letter, ends not with space, allowed chars inside
// first letter, then 3–28 allowed chars, and final char must be non-space allowed
const fullNameRe = /^[A-Za-z][A-Za-z0-9 _-]{3,28}[A-Za-z0-9_-]$/;

const [nameTouched, setNameTouched] = React.useState(false);

// Prevent invalid keystrokes (and disallow starting with a non-letter)
const handleNameBeforeInput = (e) => {
  const data = e?.data;
  if (!data) return; // Some events may not carry data (e.g., deletions)

  // Block any character not in the allowed typing set
  if (!/^[A-Za-z0-9 _-]+$/.test(data)) {
    e.preventDefault();
    return;
  }

  // Ensure first typed character is a LETTER (if caret is at position 0 and no selection)
  const target = e.target;
  const { selectionStart, selectionEnd, value } = target;
  const insertingAtStart = selectionStart === 0 && selectionEnd === 0;

  if (insertingAtStart && !/^[A-Za-z]$/.test(data) && value.length === 0) {
    e.preventDefault();
    return;
  }

  // Optional: prevent leading space when user selects all and types a space first
  if (insertingAtStart && data === ' ' && (!value || selectionEnd - selectionStart === value.length)) {
    e.preventDefault();
    return;
  }
};

const handleInputChange = (event) => {
  let next = event.target.value;

  // 1) Remove disallowed characters (keep only letters/digits/space/-/_)
  next = next.replace(/[^A-Za-z0-9 _-]/g, '');

  // 2) Enforce max 30 characters (keep this consistent with inputProps.maxLength)
  if (next.length > 30) next = next.slice(0, 30);

  setInputValue(next);

  // Don’t trim here; we trim on blur. Pass what the user sees to parent + storage.
  onFormDataChange({
    inputValue: next,
    snapShotValue: snapShotValue,
  });
  localStorage.setItem('workspaceName', next);
};

// On blur: trim leading/trailing spaces, re-cap to 30, and re-sync outward + mark touched
const handleNameBlur = () => {
  let trimmed = inputValue.trim();

  if (trimmed.length > 30) trimmed = trimmed.slice(0, 30);

  if (trimmed !== inputValue) {
    setInputValue(trimmed);
    onFormDataChange({
      inputValue: trimmed,
      snapShotValue: snapShotValue,
    });
    localStorage.setItem('workspaceName', trimmed);
  }

  // IMPORTANT: mark as touched so error/helperText can show
  setNameTouched(true);
};

const nameHasError = nameTouched && !fullNameRe.test(inputValue);

const nameHelperText = !nameTouched
  ? ' '
  : inputValue.trim().length === 0
  ? 'Workbench name is required.'
  : !/^[A-Za-z]/.test(inputValue)
  ? 'Must start with a letter.'
  : inputValue.trim().length < 1
  ? 'Minimum 5 characters.'
  : /\s$/.test(inputValue)
  ? 'Cannot end with a space.'
  : inputValue.length > 30
  ? 'Maximum 30 characters.'
  : !allowedCharsRegex.test(inputValue)
  ? 'Only letters, numbers, spaces, hyphen (-), and underscore (_).'
  : ' ';
  const handleDropdownChange = (event) => {
    setSnapShotValue(event.target.value);
    onFormDataChange({ inputValue, snapShotValue: event.target.value });
  };

  const handleBranchChange = (event) => {
    setBrachValue(event.target.value);
    setSnapShotValue('');
  };

  // Strict per-upload cancel: delegate to uploadBus.cancel(uploadId)
  const handleCancelUpload = async () => {
    try {
      const id = uploadId;
      if (!id) return;
      await uploadBus.cancel(id); // This aborts controllers and sends server abort
      safeSet(setLoading)(false);
    } catch (error) {
      console.error('Error cancelling upload:', error);
      safeSet(setLoading)(false);
      showToastMessage('ERROR', 'Failed to cancel upload.');
    }
  };

  // (Optional) reflect global bus messages locally
  useEffect(() => {
    const unsub = uploadBus.subscribe((globalState) => {
      // Only mirror messages for this uploadId (avoid cross-upload noise)
      const u = uploadBus.uploads.get(uploadId);
      if (u && u.message) safeSet(setUploadMessage)(u.message);
      if (u?.status === 'success') { safeSet(setUploadSuccess)(true); }
      if (u?.status === 'error') { safeSet(setUploadError)(true); }
    });
    return () => { try { unsub(); } catch {} };
  }, [uploadId]);

  return (
    <Box className="card-style" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', p: 2, bgcolor: 'white', mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          width: '100%',
          gap: { xm: 2, sm: 15, md: 15 },
          mb: 4.5,
          mt: 1,
          mx: { xs: 0, sm: 7, md: 6.5, lg: 6.5 },
          position: 'relative',
          right: 45,
        }}
      >
       <TextField
          label={
            <span>
              <span style={{ color: 'red', whiteSpace: 'nowrap', overflow: 'hidden' }}>*</span>
              Enter the workbench name
            </span>
          }
          value={inputValue}
          onBeforeInput={handleNameBeforeInput}
          onChange={handleInputChange}
          onBlur={handleNameBlur}
          error={nameHasError}
          helperText={nameHelperText}
          inputProps={{
            autoComplete: "off",
            spellCheck: "false",
            autoCorrect: "off",
            autoCapitalize: "off",
            maxLength: 30,
            pattern: '^[A-Za-z][A-Za-z0-9 _-]{3,28}[A-Za-z0-9_-]$', // same as fullNameRe
            inputMode: 'text',
            'aria-invalid': nameHasError || undefined,
            'aria-describedby': 'workbench-name-helper',
          }}
          FormHelperTextProps={{ id: 'workbench-name-helper' }}
          sx={{
            width: { xs: '100%', sm: 'min(80vw, 420px)', md: 450 },
            maxWidth: 600,
            '& .MuiInputLabel-root': { fontStyle: 'normal' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#00aa4d !important' },
            '& .MuiInputBase-input': { font: 'inherit', padding: '6.5px 14px !important' },
          }}
        />

        <div>
          <FormControl
            sx={{
              width: { xs: '100%', sm: 'min(80vw, 420px)', md: 450 },
              maxWidth: 600,
              fontFamily: 'Segoe UI',
              fontSize: '14px',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#00aa4d !important',
              },
            }}
          >
            <InputLabel id="branch-select-label">Select Branch</InputLabel>
            <Select
              onClick={handleUnlock}
              labelId="branch-select-label"
              id="branch-select"
              value={brachValue}
              label=" Select Branch"
              onChange={handleBranchChange}
              disabled={loadingDropdown || dropdownError || branchdropdownOptions.length === 0}
            >
              {loadingDropdown ? (
                <MenuItem disabled>Loading...</MenuItem>
              ) : dropdownError ? (
                <MenuItem disabled>Error loading options</MenuItem>
              ) : (
                branchdropdownOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))
              )}
            </Select>
            {branchdropdownError ? (
              <FormHelperText sx={{ mt: 0.5, color: '#FFBF00 !important', fontWeight: 'bold !important' }}>
                {branchdropdownError}
              </FormHelperText>
            ) : !brachValue ? (
              <FormHelperText sx={{ mt: 0.5 }}>Choose a branch to see base versions.</FormHelperText>
            ) : null}
          </FormControl>
        </div>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
        <div className="gvm-section">
          <FormControlLabel
            value="dropdown"
            control={
              <Radio
                sx={{
                  color: 'gray',
                  '&.Mui-checked': { color: '#00aa80 !important' },
                }}
              />
            }
            label={
              <FormControl
                sx={{
                  minWidth: 425,
                  fontFamily: 'Segoe UI',
                  fontSize: '14px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#00aa4d !important' },
                }}
              >
                <InputLabel id="snapshot-select-label">Select Base Version</InputLabel>
                <Select
                  labelId="snapshot-select-label"
                  id="snapshot-select"
                  value={snapShotValue}
                  label=" Select Base Version"
                  onChange={handleDropdownChange}
                  disabled={dropdownDisabled}
                >
                  {loadingDropdown ? (
                    <MenuItem disabled>Loading...</MenuItem>
                  ) : dropdownError ? (
                    <MenuItem disabled>Error loading options</MenuItem>
                  ) : snapshotDropdownOptions.length === 0 ? (
                    <MenuItem value="" disabled>
                      Select branch first
                    </MenuItem>
                  ) : (
                    snapshotDropdownOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            }
            checked={selectedRadio === 'dropdown'}
            onChange={handleRadioChange}
          />
        </div>

        <div>
          <FormControlLabel
            sx={{ fontFamily: 'Segoe UI', fontSize: '14px', whiteSpace: 'nowrap' }}
            value="upload"
            control={
              <Radio
                sx={{
                  color: 'gray',
                  '&.Mui-checked': { color: '#00aa80 !important' },
                }}
              />
            }
            label="Upload GVM Image"
            checked={selectedRadio === 'upload'}
            onChange={handleRadioChange}
          />
        </div>

        {/* Upload Button (Conditional Display) */}
        {selectedRadio === 'upload' && (
          <Button
            className="upload-btn-positin"
            variant=""
            onClick={() => document.getElementById('file-upload').click()}
            startIcon={<UploadIcon />}
            disableRipple
            disableFocusRipple
          >
            {/* Upload File */}
          </Button>
        )}

        {fileName && <p className="mt-2">{fileName}</p>}
        {fileError && (
          <p className="mt-2" style={{ color: 'red', whiteSpace: 'nowrap' }}>
            {fileError}
          </p>
        )}

        {/* File Upload - Hidden */}
        <input type="file" id="file-upload" style={{ display: 'none' }} onChange={handleFileChange} accept=".tar.gz" />

       
      </Box>
    </Box>
  );
});

export default Vdiform;

