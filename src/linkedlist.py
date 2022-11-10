class Node:
    def __init__(self, val=None)
        self.val = val 
        self.next = None


class List:
    def __init__(self, val=None):
        self.head = (val) ? Node(val) : None
    
    def queue(val):
        if (head == None) 
            self.head = Node(val)
        else
            temp = Node(val) # New node to add

            currHead = self.head  # Current place in linked list
            while (currHead.next) # Iterating thru linked list
                currHead = currHead.next
            currHead.next = temp # New head
   
    def dequeue():
        self.head = self.head.next 



'''
arr = [1, 2, 3] # MAX_SIZE = 3

arr = [None, 2, 3] # MAX_SIZE - 2
arr = [None, None, 3] index 1
arr = [4, None, 3]
arr = [4, 5, 3]
arr = [4, 5, 3] # EXCEPTION OUT OF BOUNDS
'''

arr = []
MAX_SIZE = 3
currIndex = 0

def queue(val)
    if (currIndex >= MAX_SIZE or arr[currIndex] is not None)
        print("Error: out of bounds or conflict")
        return
    
    arr[currIndex % MAX_SIZE] = val

    currIndex += 1




'''
head = List()

head = Node("1")
head.next = Node("2")
head.next = None
'''

