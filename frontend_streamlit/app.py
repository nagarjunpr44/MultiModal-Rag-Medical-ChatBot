import streamlit as st
import requests
import time
import os

# --- Configuration ---
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000/api")

st.set_page_config(
    page_title="Multi-Modal Medical RAG",
    page_icon="⚕️",
    layout="wide"
)

# --- Session State Initialization ---
if "messages" not in st.session_state:
    st.session_state.messages = []

# --- Custom CSS for a professional look ---
st.markdown("""
<style>
    .reportview-container .main .block-container{
        max-width: 800px;
        padding-top: 2rem;
    }
    .chat-message {
        padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 1rem; display: flex
    }
    .chat-message.user {
        background-color: #2b313e
    }
    .chat-message.bot {
        background-color: #475063
    }
    .stAlert {
        border-radius: 0.5rem;
    }
</style>
""", unsafe_allow_html=True)


# --- Sidebar (Upload and Controls) ---
with st.sidebar:
    st.title("⚕️ Medical RAG Setup")
    st.markdown("Upload clinical PDFs to expand the knowledge base.")
    
    uploaded_file = st.file_uploader("Upload Medical PDF", type=["pdf"])
    
    if st.button("Process Document"):
        if uploaded_file is not None:
            with st.spinner("Ingesting document into Vector Database..."):
                try:
                    # Send the file to our FastAPI upload endpoint
                    files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "application/pdf")}
                    response = requests.post(f"{API_BASE_URL}/upload", files=files)
                    
                    if response.status_code == 200:
                        st.success(f"Successfully processed {uploaded_file.name}")
                    else:
                        st.error(f"Error: {response.text}")
                except Exception as e:
                    st.error(f"Failed to connect to backend: {e}")
        else:
            st.warning("Please select a file first.")
            
    st.divider()
    st.markdown("""
    **Disclaimer:** 
    This system is for educational purposes. 
    It is not a substitute for professional medical advice.
    """)

# --- Main Chat Interface ---
st.title("🩺 Medical Assistant Chatbot")
st.markdown("Ask questions based on the ingested clinical documents.")

# Display chat messages from history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Accept user input
if prompt := st.chat_input("E.g., What are the common symptoms of migraine?"):
    # Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": prompt})
    # Display user message
    with st.chat_message("user"):
        st.markdown(prompt)

    # Call FastAPI Backend
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        full_response = ""
        
        with st.spinner("Analyzing documents..."):
            try:
                response = requests.post(
                    f"{API_BASE_URL}/chat", 
                    json={"query": prompt}
                )
                
                if response.status_code == 200:
                    answer = response.json().get("response", "No response received.")
                    # Simulate a typing effect
                    for chunk in answer.split(" "):
                        full_response += chunk + " "
                        time.sleep(0.02)
                        message_placeholder.markdown(full_response + "▌")
                    message_placeholder.markdown(full_response)
                else:
                    st.error(f"Backend Error: {response.status_code}")
                    full_response = "An error occurred."
            except Exception as e:
                st.error("Failed to connect to the backend server. Is FastAPI running?")
                full_response = "Connection Error."
                
        # Add assistant response to chat history
        st.session_state.messages.append({"role": "assistant", "content": full_response})
