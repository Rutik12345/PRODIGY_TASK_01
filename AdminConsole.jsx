import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';
import { IconButton, Button } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { MenuItem, Menu } from '@mui/material';
import { CircularProgress } from '@mui/material'; // Import CircularProgress
import axios from 'axios';
import { getLoggedInUsername, showToastMessage } from '../../../util/common.util';
import CommonMessage from '../../widgets/CommonMessage';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

  export  const multitenant_apiUrl = import.meta.env.VITE_MULTITENANT_API_URL;;
function CustomTabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

CustomTabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired,
};

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

// DataTable Component
function DataTable({ passSearchText, setRows, isPendingApprovals, onSelectionChange, type, refresh }) {
 const [columnVisibilityModel, setColumnVisibilityModel] = useState({
    requestId: false, // Initially hide requestId
    username: true,
    email: true,
    tenantName: true,
    action: true,
  });
  const columns = [
    { field: 'requestId', headerName: 'No', width: 150, headerAlign: 'left', flex: 2, resizable: false, filterable: false },
    { field: 'username', headerName: 'Username', flex: 1.8, resizable: false, filterable: false },
    { field: 'email', headerName: 'Email', flex: 2.5, resizable: false, filterable: false },
    { field: 'tenantName', headerName: 'Tenant Name', width: 120, headerAlign: 'left', flex: 2.5, resizable: false, filterable: false },
  ];

const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
const [loading, setLoading] = useState(false);
const [rowsWithId, setRowsWithId] = useState([]);
const [totalRecords, setTotalRecords] = useState();
const [rowsWithIdMap, setRowsWithIdMap] = useState();

// Fetch current page from server
  useEffect(() => {
      const status = type === 'users' ? 'APPROVED' : 'PENDING';
      const url = `${multitenant_apiUrl}tenant-access?status=${status}&page=${paginationModel.page}&size=${paginationModel.pageSize}`;


      const fetchDatabyPage = async () => {
          setLoading(true);
          try {
            const token = localStorage.getItem('TOKEN');
            const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          };
              const response = await axios.get(url,{headers: headers});
              const ct = response.headers.get('content-type') || '';
              console.log(ct);
              if (!ct.includes('application/json')) {
               console.log(ct,'session expired')
                // We landed on a login HTML after redirect
                showToastMessage('ERROR', 'Your session has expired. Please login again.');
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('/')
window.location.reload(true)
                return;
              }
              if (response?.status === 200) {
                  const { totalElements, content } = response.data;
                  setTotalRecords(totalElements);
                  // Add id = requestId for DataGrid
                  const contentWithId = content.map(row => ({ ...row, id: row.requestId }));
                  setRowsWithIdMap(contentWithId); // <-- only current page rows
              } else {
                  throw new Error(`HTTP error! Status: ${response.status}`);
              }
          } catch (error) {
            console.log(error);
            if (error.response && error.response.status === 401) {
                    // Handle Unauthorized error (Token expired or invalid)
                    console.error("Unauthorized: Token is invalid or expired.");
                    showToastMessage("ERROR", "Your session has expired. Please login again.");
                    // Redirect to login page (replace '/login' with your actual login route)
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace('/')
window.location.reload(true)
                    return; // Important: Exit the function to prevent further execution
            }
              console.error('Error ', error);
          } finally {
              setLoading(false);
          }
      };

      fetchDatabyPage();
  }, [paginationModel.page, paginationModel.pageSize, type, refresh]);  // Add 'refresh' to dependencies

  // ✅ Filter only currently displayed page rows when search changes
  useEffect(() => {
      const search = (passSearchText || '').trim().toLowerCase();
      if (!search) {
          setRowsWithId(rowsWithIdMap);
          return;
      }
      setRowsWithId(
          rowsWithIdMap.filter(row => {
              const tn = String(row.tenantName || '').toLowerCase();
              const un = String(row.username || '').toLowerCase();
              const em = String(row.email || '').toLowerCase();
              return (
                  tn.includes(search) ||
                  un.includes(search) ||
                  em.includes(search)
              );
          })
      );
  }, [rowsWithIdMap, passSearchText]);

  return (
      <Paper sx={{ height: 'calc(100vh - 300px)', width: '100%', }}>
        {loading || totalRecords > 0 ? (
          <DataGrid
              rows={rowsWithId} // Use rowsWithId here
              columns={columns}
              checkboxSelection
              rowHeight={35}
              loading={loading}
              paginationMode="server" // ✅ Enable server-side pagination
              rowCount={totalRecords}     // ✅ Total rows from API
              disableColumnFilter  // ✅ If using Pro
              disableColumnMenu    // ✅ Disable filter menu globally
              disableColumnSorting
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[10,20,30]}
              columnVisibilityModel={columnVisibilityModel}
              onRowSelectionModelChange={(selection) => {
                  if (selection.type === 'exclude') {
                      const selectedIdsArray = Array.from(selection.ids); // ✅ Convert Set to Array
                      const unselectedRows = rowsWithId.filter(row => selectedIdsArray.includes(row.id));
                      const filteredArray = rowsWithId.filter(item =>
                          !unselectedRows.some(unselectedRows => unselectedRows.requestId === item.requestId)
                      );
                      const requestIds = filteredArray.map(item => item.requestId);
                      onSelectionChange(requestIds);
                  } else {
                      const selectedIdsArray = Array.from(selection.ids); // ✅ Convert Set to Array
                      onSelectionChange(selectedIdsArray); // Pass full row objects
                  }
              }}
              sx={{
                  width: '100%',
                  border: 0,
                  '& .MuiDataGrid-cell:focus': {
                      outline: 'none', // ✅ Removes focus outline
                  },
                  '& .MuiDataGrid-cell:focus-within': {
                      outline: 'none',
                  },
                  '& .MuiDataGrid-columnHeader:focus': {
                      outline: 'none', // ✅ Remove header focus outline
                  },
                  '& .MuiDataGrid-columnHeader:focus-within': {
                      outline: 'none',
                  },
                  '& .MuiDataGrid-cell': {
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                  },
                  '@media (max-width: 1920px)': {
                      '& .MuiDataGrid-cell': {
                          fontSize: '0.95rem',
                      },
                  },

                  '@media (max-width: 768px)': {
                      '& .MuiDataGrid-cell': {
                          fontSize: '0.85rem',
                      },
                  },

                  '@media (max-width: 600px)': {
                      '& .MuiDataGrid-cell': {
                          fontSize: '0.75rem',
                      },
                      '& .MuiDataGrid-columnHeader': {
                          display: 'none',
                      },
                  },

                  '@media (max-width: 480px)': {
                      '& .MuiDataGrid-row': {
                          display: 'none',
                      },
                  },

                  '& .MuiDataGrid-columnHeader': {
                      backgroundColor: '#f0f0f0 !important',
                  },
                  '& .MuiDataGrid-footerContainer': {
                      backgroundColor: '#f5f5f5',
                  },
                  '& .MuiTablePagination-select': {
                      border: '1px solid #ccc', // Light gray border
                      borderRadius: '4px',      // Rounded corners
                  },
                  '& .MuiDataGrid-columnHeaders .MuiDataGrid-scrollbarFiller': {
                    backgroundColor: '#f0f0f0'
                }
              }}
          />
          ) : (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              No records found.
            </div>
          )}
      </Paper>
  );
}

// ActionMenu Component (Modified to receive rowsWithId)
function ActionMenu({ params, rows, setRows }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
      setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
      setAnchorEl(null);
  };


  const handleApprove = async (params) => {
      try {
          const requestId = params.row.requestId;
          const url = `${multitenant_apiUrl}tenant-access/requests/${requestId}/approve?approverUsername=` + getLoggedInUsername();
          const token = localStorage.getItem('TOKEN');
          const response = await fetch(url, {
              method: 'post',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
          });
          const ct = response.headers.get('content-type') || '';
          console.log(ct);
          if (!ct.includes('application/json')) {
           console.log(ct,'session expired')
            // We landed on a login HTML after redirect
            showToastMessage('ERROR', 'Your session has expired. Please login again.');
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/')
window.location.reload(true)
            return;
          }
          // API call successful - Update the state
          const updatedRows = rows.filter((row) => row.requestId !== params.row.requestId); //Corrected: Use requestId for filtering
          setRows(updatedRows);
          handleClose();

      } catch (error) {
          console.error("Error approving user:", error);
            if (error.response && error.response.status === 401) {
                    // Handle Unauthorized error (Token expired or invalid)
                    console.error("Unauthorized: Token is invalid or expired.");
                    showToastMessage("ERROR", "Your session has expired. Please login again.");
                    // Redirect to login page (replace '/login' with your actual login route)
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace('/')
window.location.reload(true)
                    return; // Important: Exit the function to prevent further execution
            }
          showToastMessage("ERROR", error.response?.message);
      }
  };

  const handleReject = async (params) => {
      try {
          const requestId = params.row.requestId;
          const url = `${multitenant_apiUrl}tenant-access/requests/${requestId}/reject?approverUsername=` + getLoggedInUsername();
          const token = localStorage.getItem('TOKEN');
          const response = await fetch(url, {
              method: 'post',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
          });
          const ct = response.headers.get('content-type') || '';
          console.log(ct);
          if (!ct.includes('application/json')) {
           console.log(ct,'session expired')
            // We landed on a login HTML after redirect
            showToastMessage('ERROR', 'Your session has expired. Please login again.');
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/')
window.location.reload(true)
            return;
          }
          // API call successful - Update the state
          const updatedRows = rows.filter((row) => row.requestId !== params.row.requestId);
          setRows(updatedRows);
          handleClose();

      } catch (error) {
            if (error.response && error.response.status === 401) {
                    // Handle Unauthorized error (Token expired or invalid)
                    console.error("Unauthorized: Token is invalid or expired.");
                    showToastMessage("ERROR", "Your session has expired. Please login again.");
                    // Redirect to login page (replace '/login' with your actual login route)
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace('/')
window.location.reload(true)
                    return; // Important: Exit the function to prevent further execution
            }
          console.error("Error rejecting user:", error.message);
          showToastMessage("ERROR", error.message);
      }
  };

  return (
      <>
          <IconButton onClick={handleClick} size="small">
              <MoreVertIcon />
          </IconButton>
          <Menu
              anchorEl={anchorEl}
              open={open}
              onClose={handleClose}
              elevation={2}
          >
              <MenuItem onClick={(e) => handleApprove(params)} sx={{ backgroundColor: '#00aa80', color: 'white', '&:hover': { backgroundColor: '#00886a' } }}>Approve</MenuItem>
              <MenuItem onClick={(e) => handleReject(params)} sx={{ backgroundColor: 'red', color: 'white', '&:hover': { backgroundColor: '#b30000' } }}>Reject</MenuItem>
          </Menu>
      </>
  );
}

function BasicTabs() {
  const [value, setValue] = useState(0);
  const [selectedRows, setSelectedRows] = useState([]); // ✅ Full row objects
  const [searchText, setSearchText] = useState('');
  const [refresh, setRefresh] = useState(0); // State to trigger refresh

  const handleChange = (event, newValue) => {
      setValue(newValue);
      setSelectedRows([]);
      setSearchText('');
  };


  const handleButtonClick = async (action) => {
      console.log(`${action} clicked. Selected rows:`, selectedRows);
      let payload = {}

      payload['requestIds'] = selectedRows;
      payload['action'] = action

      console.log("Payload ", payload)
      try {
          const token = localStorage.getItem('TOKEN');
          const response = await axios.post(multitenant_apiUrl + `tenant-access/requests/bulk?approverUsername=` + getLoggedInUsername(), 
          payload,
          {
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }});
          const ct = response.headers.get('content-type') || '';
          console.log(ct);
          if (!ct.includes('application/json')) {
           console.log(ct,'session expired')
            // We landed on a login HTML after redirect
            showToastMessage('ERROR', 'Your session has expired. Please login again.');
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/')
window.location.reload(true)
            return;
          }
          console.log('Response:', response.data);
          if (response.data.failureCount === 0) {
              showToastMessage("SUCCESS", response.data.message);
          }
          else if (response.data.failureCount === selectedRows.length) {
              showToastMessage("ERROR", response.data.errors[0].error);
          } else {
              showToastMessage("WARN", response.data.message);
          }
          // Trigger refresh
          setRefresh(prevRefresh => prevRefresh + 1);

      } catch (error) {
          console.log('Error Response:', error);
            if (error.response && error.response.status === 401) {
                    // Handle Unauthorized error (Token expired or invalid)
                    console.error("Unauthorized: Token is invalid or expired.");
                    showToastMessage("ERROR", "Your session has expired. Please login again.");
                    // Redirect to login page (replace '/login' with your actual login route)
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace('/')
window.location.reload(true)
                    return; // Important: Exit the function to prevent further execution
            }
          showToastMessage("ERROR", error.response.data.message);
      }
  };

  return (
      <Box sx={{ width: '100%', backgroundColor: 'white',
      borderLeft: '6px solid #00aa80',
      borderRadius: '12px',
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.1)',
      width: '100%',
      margin: '12px auto'
      }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={value} onChange={handleChange} aria-label="basic tabs example" sx={{
                  '& .MuiTab-root.Mui-selected': {
                      color: '#00aa80',
                  },
                  '& .MuiTabs-indicator': { // Target the indicator
                      backgroundColor: '#00aa80',
                  },
              }}>
                  <Tab label="Users" {...a11yProps(0)} />
                  <Tab label="Pending Approvals" {...a11yProps(1)} />
              </Tabs>
          </Box>

          {/* ✅ Action Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, paddingRight: '24px', paddingLeft: '24px' }}>
              <TextField
                  label="Search username/tenant"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  placeholder="Search username/tenant..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  InputProps={{
                      startAdornment: (
                          <InputAdornment position="end">
                              <SearchIcon />
                          </InputAdornment>
                      ),
                      endAdornment: searchText && (
                          <InputAdornment position="end">
                              <IconButton onClick={() => setSearchText('')} edge="end">
                                  <ClearIcon />
                              </IconButton>
                          </InputAdornment>
                      ),
                  }}
                  style={{ width: 300, marginBottom: '1rem', display: 'block' }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                  {value === 0 && (
                      <Button variant="contained" color="error" onClick={() => handleButtonClick('REVOKE')} disabled={selectedRows.length === 0}
                          sx={{
                              backgroundColor: '#f44336', // Red
                              color: '#fff',
                              fontSize: '0.85rem',
                              textTransform: 'none',
                              padding: '4px 12px', // Smaller padding
                              borderRadius: '6px',
                              minWidth: '80px',
                              '&:hover': {
                                  backgroundColor: '#d9363e', // Darker red on hover
                                  transform: 'scale(1.05)',
                              },
                              transition: 'all 0.3s ease',
                          }}
                      >
                          Revoke
                      </Button>
                  )}
                  {value === 1 && (
                      <>
                          <Button variant="contained" color="success" sx={{ mr: 1,
                              backgroundColor: '#4caf50', // Green
                              color: '#fff',
                              fontSize: '0.85rem',
                              textTransform: 'none',
                              padding: '4px 12px',
                              borderRadius: '6px',
                              minWidth: '80px',
                              '&:hover': {
                                  backgroundColor: '#218838', // Darker green
                                  transform: 'scale(1.05)',
                              },
                              transition: 'all 0.3s ease',
                          }}
                              onClick={() => handleButtonClick('APPROVE')} disabled={selectedRows.length === 0}>
                              Approve
                          </Button>
                          <Button variant="contained" color="error"
                              sx={{
                                  textTransform: 'none',
                                  backgroundColor: '#ff9800', // Orange
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                  textTransform: 'none',
                                  padding: '4px 12px',
                                  borderRadius: '6px',
                                  minWidth: '80px',
                                  '&:hover': {
                                      backgroundColor: '#e68900', // Darker orange
                                      transform: 'scale(1.05)',
                                  },
                              }}
                              onClick={() => handleButtonClick('REJECT')} disabled={selectedRows.length === 0}>
                              Reject
                          </Button>
                      </>
                  )}
              </Box>
          </Box>

          <CustomTabPanel value={value} index={0}>
              <DataTable passSearchText={searchText} onSelectionChange={setSelectedRows} type={'users'} refresh={refresh} />

          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
              <DataTable passSearchText={searchText} onSelectionChange={setSelectedRows} type={'pending'} refresh={refresh} />
      </CustomTabPanel>
    </Box>
  );
}

export const AdminConsole = () => {
  return (
    <div className='main'>
      <div className='wrapper' sx={{paddingBottom:'20px'}}>
        <div className='container-fluid admin-console-table'>
          <div>
            <CommonMessage />
            <BasicTabs />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminConsole;