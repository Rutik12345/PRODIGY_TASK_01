import { useState, useEffect , useRef } from 'react';
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Vdiform from './VdiForm';
import WorkbenchCards from './WorkbenchCards';
import { Box, Button } from '@mui/material';
import Stack from '@mui/material/Stack';
import WorkspaceVdiCard from './WorkspaceVdiCard';
import { useNavigate } from 'react-router-dom'; // For navigation
import Chip from '@mui/material/Chip';
import CloseIcon from '@mui/icons-material/Close';
import { getLoggedInUsername,showToastMessage } from '../../util/common.util';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
 

 
export default function Accordianexpansion({ inputValue, snapShotValue,fileName,selectedTenant,}) {
    const apiUrl = import.meta.env.VITE_API_URL;
    const [vdiSelected, setVdiSelected] = useState(false);
    const [ecuSelected, setEcuSelected] = useState(false);
    const [vdiCardsSelected, setVdiCardsSelected] = useState([]);
    const [inputVal, setInputVal] = useState("");
    const [snapShotVal, setSnapShotVal] = useState("");
    const [uploadedfileg, setUploadedValue] = useState("");
    const navigate = useNavigate();
    const numberOfCards = 3;
    const cards = Array.from({ length: numberOfCards }, (_, index) => index);
    const tools = [
        { name: 'Tool A', version: '1.2.3' },
        { name: 'Tool B', version: '2.0.0' },
        { name: 'Tool C', version: '1.0.1' },
    ];
 console.log("inputValue, snapShotValue,uploadedFile,selectedTenant,",inputValue, snapShotValue,fileName,selectedTenant);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [passLaunchEvent, setPassLaunchEvent] = useState(0);
    const [UplaodedGvmFile,setUploadedGvmFile]= useState('');
    const childRef = useRef(null);
    const [status, setStatus] = useState("Idle");
     const [vdiAvailable, setVdiAvailable] = useState(true);
 const [vecuAvailable, setVecuAvailable] = useState(true);
  

    const fetchData = async () => {
  try {
    const token = localStorage.getItem('TOKEN');

    const username = getLoggedInUsername();
    const tenant_id = JSON.parse(localStorage.getItem('selectedTenant')).id;
   const roleContext = JSON.parse(localStorage.getItem("roleContext"));
  const role_ids = roleContext?.allRoles?.[0]?.id;


    const params = new URLSearchParams({
      username,
      tenant_id,
      role_ids
    });

    const response = await fetch(
      apiUrl + `catalog/workbench-config?${params.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      }
    );

    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      showToastMessage("ERROR", "Your session has expired. Please login again.");
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/')
window.location.reload(true);
      return;
    }

    const data = await response.json();
    setData(data);
    setVdiAvailable(Array.isArray(data?.VDI) && data.VDI.length > 0);
setVecuAvailable(Array.isArray(data?.vECU) && data.vECU.length > 0);

  } catch (error) {
    console.error("Error fetching data:", error);
    showToastMessage("ERROR", "Something went wrong while fetching data.");
  } finally {
    setLoading(false);
  }
};


 useEffect(() => {
  console.log("Call Webconfig on tenant change", selectedTenant)
  setVdiCardsSelected('')
  setVdiSelected(false);
  setSelectedVecu([]);
  setInputVal("");
  setSnapShotVal("");
  setUploadedValue("");
  fetchData();
}, [selectedTenant]);


    useEffect(() => {
        fetchData();
    }, []);
 


const handleLaunchClick = async () => {
    // Reset parent-scoped bits first
    setChildData(undefined);
    setVdiId(undefined);
    setVdiSelected(false);
    // setPassLaunchEvent(true);
    setPassLaunchEvent(t => t + 1);
    console.log(selectedVdi);
 
 const vecuSnapshot = Array.isArray(selectedVEcu) ? [...selectedVEcu] : [];
  // 🔹 Immediately reset vECU selection in UI (chips disappear right away)
  setSelectedVecu([]);

    const storedUserData = localStorage.getItem('userData');
    const parsedUserData = JSON.parse(storedUserData || '{}');
    const token = localStorage.getItem('TOKEN');
 
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // 1) If GVM upload path is used, wait for child upload to finish
    if (selectedVEcu.length > 0) {
      if (childRef.current && typeof childRef.current.executeTask === 'function') {
        setStatus("Parent waiting for child...");
        try {
          const result = await childRef.current.executeTask(); // may reject with { code:'ABORTED' }
          setUploadedGvmFile(result.GvmFileName);
          setStatus(`Child task resolved: ${result.GvmFileName}. Parent can continue now.`);
        } catch (error) {
          // If user aborted upload, STOP launch right here with a friendly message.
          if (error?.code === 'ABORTED' || /aborted/i.test(String(error?.message || error))) {
            setStatus('Upload aborted by user. Launch canceled.');
            if (typeof setSelectedVEcu === 'function') {
              setSelectedVEcu([]); // reset the VEcu accordion selection
            }
            return; // HARD STOP
          }
          
          // Other errors: inform & stop launch as well
          setStatus(`An error occurred: ${error?.message || error}`);
          showToastMessage('ERROR', `Upload failed: ${error?.message || 'Unknown error'}`);
          return; // Stop launch if upload failed
        }
      }
    }
 
    // 2) Proceed with LAUNCH only if we didn't return above
    const toastId = toast.loading(
      "Launch is initiated, Kindly wait for few minutes",
      {
        style: { background: "#07bc0c", color: "#ffffff" },
        progressStyle: { background: "#ffffff" },
        closeButton: false,
        autoClose: false,
      }
    );
 
    try {
      const requestBody = {
        "username": getLoggedInUsername(),
        "tenent_id": JSON.parse(localStorage.getItem('selectedTenant')).id,
        "tenant_name": JSON.parse(localStorage.getItem('selectedTenant')).label,
        "user_id": parsedUserData?.userId,
        "snapshot_id": snapShotVal ? snapShotVal : '',
        "gvm_image": uploadedfileg,
        "workbench_name": inputVal,
        "vdi_id": selectedVdiId.toString(),
        "vdi_name": selectedVdi,
        "vecu_name": [],
        "vecu_id": [],
        "vecu_map": selectedVEcu.reduce((map, vecuName) => {
          const vecuData = data?.vECU.find(vecu => vecu.workbenchName === vecuName);
          if (vecuData) {
            map[vecuData.tool_id] = vecuData.workbenchName; // key: tool_id, value: workbenchName
          }
          return map;
        }, {})
      };
 
      const response = await fetch(apiUrl + 'catalog/workbench', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
 
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
 
      const responseData = await response.json();
      console.log("API Response:", responseData);
      if (responseData.message) {
        toast.update(toastId, {
          render: "Request successful!",
          type: "success",
          isLoading: false,
          autoClose: 3000,
        });
        navigate('/my_workbench');
      } else {
        toast.dismiss(toastId);
        console.error("API Error:", responseData.message);
        showToastMessage("ERROR", "Launch failed: " + (responseData.message || "Unknown error"));
      }
    } catch (error) {
      toast.dismiss(toastId);
      setError(error);
      console.error("Error launching workspace:", error);
      showToastMessage("ERROR", "Launch failed: " + (error.message || "Unknown error"));
      if (error.response && error.response.status === 401) {
        showToastMessage("ERROR", "Your session has expired. Please login again.");
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('/')
window.location.reload(true);
        return;
      }
    }
  };
    const [selectedVdi, setChildData] = useState("");
    const [selectedVdiId, setVdiId] = useState("");
    const [selectedVEcu, setSelectedVecu] = useState([])
    const handleVdiSelection = (data) => {
 
        if (data) {
            setChildData(data.workbenchName);
            setVdiId(data.tool_id);
            setVdiSelected(true);
        } else {
            setChildData(undefined);
            setVdiId(undefined);
            setVdiSelected(false);
        }
 
    };
 
    const handleVecuSelection = (data) => {
        console.log("from child to parent", data);
        let newSelectedVecus = [...selectedVEcu];
 
        if (newSelectedVecus.includes(data?.workbenchName)) {
            newSelectedVecus = newSelectedVecus?.filter(name => name !== data.workbenchName);
        } else {
            newSelectedVecus.push(data?.workbenchName);
        }
 
        setSelectedVecu(newSelectedVecus);
    };
    const handleVdiChange = (index) => {
        let newSelectedCards = [...vdiCardsSelected];
        if (newSelectedCards.includes(index)) {
            newSelectedCards = newSelectedCards.filter(cardIndex => cardIndex !== index);
        } else {
            newSelectedCards.push(index);
        }
        setVdiCardsSelected(newSelectedCards);
    };
 
 
    const handleEcuToggle = (event) => {
        setEcuSelected(event.target.checked);
    };
    // Function to handle data changes from Vdiform
    // const handleFormDataChange = (formData) => {
    //     console.log("FormData in AccordianExpansion:", formData);
    //     setInputVal(formData.inputValue);
    //     setSnapShotVal(formData.snapShotValue);
    //     setUploadedValue(formData.fileName)
    // };
    const handleFormDataChange = (formData) => {
        // Only update keys that are present; do NOT overwrite others with undefined
        if (Object.prototype.hasOwnProperty.call(formData, 'inputValue')) {
          setInputVal(formData.inputValue ?? '');
        }
        if (Object.prototype.hasOwnProperty.call(formData, 'snapShotValue')) {
          setSnapShotVal(formData.snapShotValue ?? '');
        }
        if (Object.prototype.hasOwnProperty.call(formData, 'fileName')) {
          setUploadedValue(formData.fileName ?? '');
        }
      };
       
 
     const handleDeleteVdi = () => {
        setVdiSelected(false);
        setChildData("");
    };
 
    const handleDeleteVecu = (ecuName) => {
        const newSelectedVecus = selectedVEcu.filter((name) => name !== ecuName);
        setSelectedVecu(newSelectedVecus);
    };
 
    console.log("vdiSelected:", vdiSelected);
    console.log("inputValue:", inputValue);
    console.log("snapShotValue:", snapShotValue);
 
    const isDisabled = !((vdiSelected && inputVal && snapShotVal) || (inputVal && selectedVEcu.length > 0 && uploadedfileg));
 
    return (
        <div>
 
<ToastContainer />
            <Vdiform passLaunchEvent={passLaunchEvent} onFormDataChange={handleFormDataChange} selectedTenant={selectedTenant} ref={childRef}/>
            <Box sx={{ marginBottom: '16px', boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)', }}>
                <Accordion sx={{
                    
                    mb: '16px',
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)',
                    backgroundColor: '#fff',
                    borderLeft: '6px solid #00aa80',
                    borderRadius: '12px',

                    backgroundColor: 'white',
                    transition: 'transform 0.5s ease-in-out',
                    transform: 'translateY(0)',
                    overflow: 'hidden',
                    '&[expanded]': {
                        transform: 'translateY(-150%)',
                    },
                    '&[collapsed]': {
                        transform: 'translateY(0)',
                    },
                }}>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="panel1-content"
                        id="panel1-header"
                    >
                        <Typography variant="subtitle1" component="span" sx={{marginLeft: '10px', fontWeight: 'bold', fontFamily: 'Segoe UI', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
                            Select VDI
                            <span  style={{ marginLeft: '8px', fontFamily: 'Segoe UI', fontSize: '13px', color: '#FFBF00' }}>
                                {!vdiSelected && <p>VDI not selected : select a VDI to access the console and development tools.</p>}
                            </span>
                           <span className='' style={{ marginLeft: '8px', color: '#00aa80 ' }}>
                                {vdiSelected && (
                                    <Chip
                                        label={selectedVdi}
                                        size="small"
                                        color="success"  // Green color
                                        sx={{ bgcolor: '#00aa80' }}
                                        onDelete={handleDeleteVdi}
                                        deleteIcon={<CloseIcon />}
                                    />
                                )}
                            </span>
                        </Typography>
                    </AccordionSummary>
                    {/* <AccordionDetails sx={{ padding: '16px' }}>
                        <Box sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-evenly',
                            alignItems: 'center'
                        }}>
                            {data?.VDI?.map((dataObject, index) => (
                                <WorkspaceVdiCard key={index} data={dataObject} onSelectVdi={handleVdiSelection} isSelected={dataObject.workbenchName == selectedVdi} sx={{ m: 2 }} />
                            ))}
                        </Box>
                    </AccordionDetails> */}
                    <AccordionDetails sx={{ padding: '16px' }}>
  {!vdiAvailable ? (
    <Typography
      sx={{
        fontSize: '13px',
        color: '#555',
        textAlign: 'center',
        fontFamily: 'Segoe UI'
      }}
    >
      Tool is not available for this tenant.
    </Typography>
  ) : (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-evenly'
      }}
    >
      {data?.VDI?.map((item, index) => (
        <WorkspaceVdiCard
          key={`${selectedTenant?.id}-${item.workbenchName}`}
          data={item}
          onSelectVdi={handleVdiSelection}
          isSelected={item.workbenchName === selectedVdi}
        />
      ))}
    </Box>
  )}
</AccordionDetails>
                </Accordion>
            </Box>
 
            <Box sx={{ marginBottom: '25px', boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)', }}>
                <Accordion sx={{
                    mb: '16px',
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)',
                    backgroundColor: '#fff',
                    borderLeft: '6px solid #00aa80',
                    borderRadius: '12px',
                    backgroundColor: 'white',
                    transition: 'transform 0.5s ease-in-out',
                    transform: 'translateY(0)',
                    overflow: 'hidden',
                    '&[expanded]': {
                        transform: 'translateY(-150%)',
                    },
                    '&[collapsed]': {
                        transform: 'translateY(0)',
                    }
                }}>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        aria-controls="panel2-content"
                        id="panel2-header"
                    >
 
                        <Typography variant="subtitle1" component="span" sx={{ marginLeft: '10px',fontWeight: 'bold', fontFamily: 'Segoe UI', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
                            Select vECU
                            {/* <span className='' style={{ marginLeft: '8px', color: '#FFBF00',fontFamily: 'Segoe UI', fontSize: '13px', }}>{selectedVEcu.length === 0 && <p>vECU not selected</p>}</span> */}
                            <span  style={{ marginLeft: '8px', color: '#FFBF00',fontFamily: 'Segoe UI', fontSize: '13px', }} > *This feature is currently under development.</span>
                            <span className='mt-' style={{ marginLeft: '8px', color: '#00aa80 ' }}>
                                <div className ='chips-spacing'>
                                    {selectedVEcu.map((ecuName, index) => (
                                        <Chip
                                            key={index}
                                            label={ecuName}
                                            size="small"
                                            color="success"  // Green color
                                            sx={{ bgcolor: '#00aa80' }}
                                            onDelete={() => handleDeleteVecu(ecuName)}
                                            deleteIcon={<CloseIcon />}
                                        />
                                    ))}
                                </div>
                            </span>
                        </Typography>
                    </AccordionSummary>
                    {/* <AccordionDetails sx={{ padding: '16px' }}>
                        <Box sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-around',
                            alignItems: 'center'
                        }}>
                            {data?.vECU?.map((dataObject, index) => (
                                <WorkbenchCards key={index} data={dataObject} onSelectVecu={handleVecuSelection} isSelectedVecu={selectedVEcu.includes(dataObject.workbenchName)} sx={{ m: 2 }} />
                            ))}
                        </Box>
                    </AccordionDetails> */}
                    <AccordionDetails sx={{ padding: '16px' }}>
  {!vecuAvailable ? (
    <Typography
      sx={{
        fontSize: '13px',
        color: '#555',
        textAlign: 'center',
        fontFamily: 'Segoe UI'
      }}
    >
      No tools are configured for this tenant.
    </Typography>
  ) : (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-around'
      }}
    >
      {data?.vECU?.map((item, index) => (
        <WorkbenchCards
          key={index}
          data={item}
          onSelectVecu={handleVecuSelection}
          isSelectedVecu={selectedVEcu.includes(item.workbenchName)}
        />
      ))}
    </Box>
  )}
</AccordionDetails>
                </Accordion>
            </Box>
 
 
            <Stack spacing={2} direction="row" justifyContent="flex-end" alignItems="flex-end" sx={{ position: 'relative',left:14, bottom: 0, right: 0, padding: '16px' }}>
                <Button type='button' className='launch-btn' variant="contained" sx={{ backgroundColor: '#00aa80', textTransform: 'capitalize !important', '&:hover': { backgroundColor: '#008065' } }}
                    disabled={isDisabled}
                    onClick={handleLaunchClick}>
                    Launch
                </Button>
            </Stack>
        </div>
    );
}